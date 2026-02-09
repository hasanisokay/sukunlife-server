import express from "express";
import dbConnect from "../config/db.mjs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { ObjectId } from "mongodb";
import convertDateToDateObject, {
  capitalize,
  convertISODateToDateObject,
  convertTo12Hour,
  formatDateWithOrdinal,
} from "../utils/convertDateToDateObject.mjs";
import sendAdminBookingConfirmationEmail from "../utils/sendAdminBookingConfirmationEmail.mjs";
import nodemailer from "nodemailer";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";
import { generateInvoicePDF } from "../utils/generateInvoicePDF.js";
import { generateInvoiceHTML } from "../utils/generateInvoiceHTML.js";

const router = express.Router();
const db = await dbConnect();
dotenv.config();
const paymentCollection = db?.collection("payments");
const appointmentCollection = db?.collection("appointments");
const courseCollection = db?.collection("courses");
const shopCollection = db?.collection("shop");
const voucherCollection = db?.collection("vouchers");
const orderCollection = db?.collection("orders");
const resourceCollection = db?.collection("resources");
const usersCollection = db?.collection("users");

const CLIENT_URL = process.env.CLIENT_URL;
let transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_SERVICE_HOST,
  secure: false,
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASS,
  },
});

const PAYSTATION_URL = "https://api.paystation.com.bd";

function getInvoicePrefix(source) {
  const map = {
    appointment: "APT",
    cart: "ORD",
    shop: "ORD",
    donation: "DON",
  };

  return map[source] || "SUK";
}

router.post("/initiate", async (req, res) => {
  try {
    const {
      name,
      mobile,
      address,
      email,
      source,
      items,
      voucherCode,
      deliveryArea,
      loggedInUser,
    } = req.body;

    if (!name || !mobile || !address || !source) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const prefix = getInvoicePrefix(source);
    const invoice = `${prefix}-${new ObjectId().toString()}`;
    let amount = 0;
    let orderPayload = {};
    if (source === "appointment") {
      const bookingData = req.body;
      const trimmedBookingData = {};
      for (const key in bookingData) {
        trimmedBookingData[key] =
          typeof bookingData[key] === "string"
            ? bookingData[key].trim()
            : bookingData[key];
      }
      const { date, startTime, endTime, consultant } = trimmedBookingData;
      // Validate required slot information
      if (!date || !startTime || !endTime || !consultant) {
        return res.status(400).json({
          message:
            "Missing required booking information (date, startTime, endTime, consultant)",
          status: 400,
        });
      }
      const existingSlot = await scheduleCollection.findOneAndDelete({
        date: date,
        startTime: startTime,
        endTime: endTime,
        // consultants: consultant,
      });
      if (!existingSlot) {
        return res.status(409).json({
          message:
            "This time slot is no longer available. Please select another time.",
          status: 409,
        });
      }
      amount = 500;
      orderPayload = {
        ...req.body,
        deletedSlot: existingSlot,
      };
    } else if (source === "shop") {
      if (!items.length) {
        return res.status(400).json({ message: "No items provided" });
      }

      const orderItems = [];

      for (const item of items) {
        let product;
        if (item.type === "course") {
          if (!loggedInUser) {
            return res
              .status(400)
              .json({ message: "No user found. Must login to buy course." });
          }
          product = await courseCollection.findOne({
            _id: new ObjectId(item.productId),
          });
        } else if (item.type === "product") {
          product = await shopCollection.findOne({
            _id: new ObjectId(item.productId),
          });
        } else if (item.type === "literature") {
          product = await resourceCollection.findOne({
            _id: new ObjectId(item.productId),
          });
        }

        if (!product) {
          return res.status(400).json({ message: "Invalid product" });
        }

        if (item.type === "product" && product?.stock < item?.quantity) {
          return res.status(400).json({
            message: `${product.title} is out of stock`,
          });
        }
        let unitPrice = Number(product?.price);

        if (
          item.type === "product" &&
          Array.isArray(product?.variantPrices) &&
          item?.variant
        ) {
          const matchedVariant = product.variantPrices.find((v) => {
            const sizeMatch = v.size === String(item.variant.size);
            const colorMatch =
              !v.color || v.color === "" || v.color === item.variant.color;

            return sizeMatch && colorMatch;
          });

          if (matchedVariant?.price) {
            unitPrice = Number(matchedVariant.price);
          }
        }
        let itemTotal;
        if (item.type === "product" || item.type === "literature") {
          itemTotal = unitPrice * item.quantity;
        } else if (item.type === "course") {
          itemTotal = unitPrice;
        }
        amount += itemTotal;

        orderItems.push({
          productId: product._id,
          title: product.title,
          quantity: item.quantity,
          price: unitPrice,
          unit: item.unit || "",
          variant: item.variant || null,
          itemType: item.type,
        });
      }

      /* ---------- VOUCHER ---------- */
      let discount = 0;
      let voucherData = null;

      if (voucherCode) {
        const voucher = await voucherCollection.findOne({
          code: voucherCode,
          isActive: true,
        });

        if (voucher) {
          discount =
            voucher.type === "percentage"
              ? Math.floor((amount * voucher.value) / 100)
              : voucher.value;
          if (voucher.maxLimit && discount > voucher.maxLimit) {
            discount = voucher?.maxLimit;
          }
          amount -= discount;
          voucherData = { code: voucher.code, discount };
        }
      }
      let deliveryCharge = 120;

      if (deliveryArea === "Inside Dhaka") {
        deliveryCharge = 80;
      }
      amount += deliveryCharge;

      orderPayload = {
        items: orderItems,
        voucher: voucherData,
        deliveryCharge,
      };
    }

    if (!amount) {
      return res.status(400).json({ message: "Invalid payment source" });
    }

    // Save pending payment FIRST
    await paymentCollection.insertOne({
      invoice,
      prefix,
      source,
      amount,
      loggedInUser,
      status: "pending",
      customer: { name, mobile, email, address },
      payload: orderPayload, // raw data if needed later
      createdAt: new Date(),
    });

    const payload = {
      merchantId: process.env.PAYSTATION_MERCHANT_ID,
      password: process.env.PAYSTATION_PASSWORD,
      invoice_number: invoice,
      currency: "BDT",
      payment_amount: amount,
      pay_with_charge: 1,
      reference: source,
      cust_name: name,
      cust_phone: mobile,
      cust_email: email,
      cust_address: address,
      callback_url: `${process.env.SERVER_URL}/api/paystation/callback`,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${PAYSTATION_URL}/initiate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();
      return res.json(data);
    } catch (err) {
      await paymentCollection.updateOne(
        { invoice },
        { $set: { status: "failed" } },
      );

      return res.status(500).json({ message: "Payment initiation failed" });
    }
  } catch {
    return res.status(500).json({ message: "Payment initiation failed" });
  }
});

router.get("/callback", (req, res) => {
  const { status, invoice_number, message } = req.query;

  if (status !== "Successful") {
    return res.redirect(
      `${CLIENT_URL}/payment-failed?invoice=${invoice_number}&&message=${message}`,
    );
  }

  return res.redirect(
    `${CLIENT_URL}/payment-success?invoice=${invoice_number}&&message=${message}`,
  );
});

async function verifyPayment(invoice_number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${PAYSTATION_URL}/transaction-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        merchantId: process.env.PAYSTATION_MERCHANT_ID,
      },
      body: JSON.stringify({ invoice_number }),
      signal: controller.signal,
    });

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
router.post("/finalize-payment", async (req, res) => {
  try {
    const { invoice_number } = req.body;
    const paymentResult = await paymentCollection.findOneAndUpdate(
      { invoice: invoice_number, status: "pending" },
      { $set: { status: "processing" } },
      { returnDocument: "after" },
    );
    if (!paymentResult) {
      return res.status(200).json({ alreadyProcessed: true });
    }
    const payment = paymentResult;
    // Verify with PayStation
    const verification = await verifyPayment(invoice_number);
    const v = verification?.data;

    if (
      verification?.status?.toLowerCase() !== "success" ||
      v?.trx_status?.toLowerCase() !== "successful"
    ) {
      await paymentCollection.updateOne(
        { invoice: invoice_number, status: "processing" },
        { $set: { status: "pending" } },
      );
      return res.status(400).json({
        message: "Payment verification failed",
        source: payment?.source,
      });
    }

    //  Mark paid
    await paymentCollection.updateOne(
      { invoice: invoice_number },
      {
        $set: {
          status: "paid",
          trx_id: v.trx_id,
          payment_method: v?.payment_method,
          paidAt: new Date(),
          raw_response: verification,
        },
      },
    );

    if (payment.source === "appointment") {
      const emailSendingDetails = {
        ...payment,
        trx_id: v.trx_id,
        payment_method: v.payment_method,
      };
      await createAppointment(payment, verification, emailSendingDetails).catch(
        console.error,
      );
    } else if (payment.source === "shop") {
      const orderResult = await createOrder(payment);
      Promise.all([
        sendAdminOrderNotificationEmail(orderResult.order, transporter),
        sendUserOrderInvoiceEmail(orderResult.order, transporter),
      ]).catch(console.error);
    }

    await paymentCollection.updateOne(
      { invoice: invoice_number, status: "paid" },
      { $set: { fulfilled: true, fulfilledAt: new Date() } },
    );
    return res.status(200).json({ success: true, source: payment?.source });
  } catch (error) {
    console.error("Finalize payment error:", error);
    return res.status(500).json({ message: "Finalize failed" });
  }
});

const createAppointment = async (
  payment,
  verification,
  emailSendingDetails,
) => {
  const deletedSlot = payment?.deletedSlot;
  try {
    const v = verification?.data;
    const booking = payment?.payload;
    const appointment = {
      ...booking,
      invoice: payment.invoice,
      paymentId: payment._id,
      paymentMethod: v.payment_method,
      trx_id: v.trx_id,
      paidAmount: payment.amount,
      paymentStatus: "paid",
      bookedDate: convertISODateToDateObject(booking.date),
      bookingDate: new Date(),
      createdAt: new Date(),
    };

    try {
      await appointmentCollection.insertOne(appointment);
      await paymentCollection.updateOne(
        { invoice: payment.invoice },
        {
          $unset: { deletedSlot: "" },
        },
      );

      Promise.all([
        sendAdminBookingConfirmationEmail(appointment, transporter),
        sendUserPaymentConfirmationEmail(emailSendingDetails, transporter),
      ]).catch(console.error);
    } catch (e) {
      console.log("sending admin email failed", e);
    }
    return { status: 200 };
  } catch (error) {
    await scheduleCollection.insertOne(deletedSlot).catch((err) => {
      console.error("Failed to restore slot after booking failure:", err);
    });
    console.error("Appointment creation failed:", error);
    throw error;
  }
};
// async function sendUserPaymentConfirmationEmail(payment, transporter) {
//   const subject = "Your Appointment is Confirmed";

//   const safe = (v = "") =>
//     String(v).replace(
//       /[&<>"']/g,
//       (s) =>
//         ({
//           "&": "&amp;",
//           "<": "&lt;",
//           ">": "&gt;",
//           '"': "&quot;",
//           "'": "&#39;",
//         })[s],
//     );

//   const html = `
//     <h2>Payment Successful</h2>

//     <p>Thank you, ${safe(payment.customer.name)}.</p>
//     <p>Your payment has been successfully received.</p>

//     <p><strong>Invoice:</strong> ${payment.invoice}</p>
//     <p><strong>Amount:</strong> ${payment.amount} BDT</p>
//     <p><strong>Payment Method:</strong> ${payment.payment_method}</p>
//     <p><strong>Transaction ID:</strong> ${payment.trx_id}</p>
//     <p><strong>Service:</strong> ${capitalize(payment?.payload?.service)}</p>
//     <p><strong>Appointment Date:</strong> ${formatDateWithOrdinal(payment?.payload?.date)}</p>
//     <p><strong>Start Time:</strong> ${convertTo12Hour(payment?.payload?.startTime)}</p>
//     <p><strong>End Time:</strong> ${convertTo12Hour(payment?.payload?.endTime)}</p>
//     <p><strong>Consultant:</strong> ${payment?.payload?.consultant}</p>

//     <hr />

//     <p>Your appointment has been booked successfully.</p>
    
//     <p>
//       <a href=${process.env.SERVER_URL}/api/paystation/invoice/${payment.invoice}">
//         View / Print Invoice
//       </a>
//     </p>

//     <p>You can keep this email for your records.</p>
//   `;

//   try {
//     await transporter.sendMail({
//       from: `"SukunLife" <${process.env.EMAIL_ID}>`,
//       to: payment.customer.email,
//       subject,
//       html,
//       text: `Payment successful.
// Invoice: ${payment.invoice}
// Amount: ${payment.amount} BDT`,
//     });
//   } catch (err) {
//     console.error("User confirmation email failed:", err);
//   }
// }

//changed email template, yet to test


async function sendUserPaymentConfirmationEmail(payment, transporter) {
  const subject = "Payment Successful – SukunLife";

  const safe = (v = "") =>
    String(v).replace(
      /[&<>"']/g,
      (s) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[s]
    );

  const {
    invoice,
    amount,
    payment_method,
    trx_id,
    customer,
    payload,
  } = payment;

  const service =
    payload?.service === "emergency-ruqyah"
      ? "Emergency Ruqyah"
      : capitalize(payload?.service);

  const invoiceUrl = `${process.env.SERVER_URL}/api/paystation/invoice/${invoice}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Payment Confirmation</title>
</head>

<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);">

  <!-- Header -->
  <tr>
    <td align="center" style="padding:30px 20px 10px 20px;">
      <img src="https://sukunlife.github.io/audio/logo.jpg"
           alt="SukunLife Logo"
           width="180"
           style="display:block;margin-bottom:10px;border-radius:6px;" />
    </td>
  </tr>

  <tr>
    <td style="padding:0 40px 20px 40px;">
      <div style="
        background:#ecfdf5;
        border:1px solid #10b981;
        padding:14px 18px;
        border-radius:8px;
        font-size:14px;
        color:#065f46;
        text-align:center;">
        <strong>Payment Successful</strong>
      </div>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:10px 40px 30px 40px;color:#374151;font-size:15px;line-height:1.7;">

      <p>Hi <strong>${safe(customer?.name)}</strong>,</p>

      <p>
        We have successfully received your payment. 
        Your appointment is now fully confirmed.
      </p>

      <!-- Payment Details -->
      <table width="100%" cellpadding="0" cellspacing="0"
        style="margin:25px 0;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;padding:20px;">

        <tr>
          <td style="padding:6px 0;"><strong>Invoice:</strong></td>
          <td style="padding:6px 0;text-align:right;">${safe(invoice)}</td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Amount:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${safe(amount)} BDT
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Payment Method:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${safe(payment_method)}
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Transaction ID:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${safe(trx_id)}
          </td>
        </tr>

      </table>

      <!-- Appointment Details -->
      <h3 style="margin-bottom:10px;color:#111827;">Appointment Summary</h3>

      <table width="100%" cellpadding="0" cellspacing="0"
        style="margin:15px 0 25px 0;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;padding:20px;">

        <tr>
          <td style="padding:6px 0;"><strong>Service:</strong></td>
          <td style="padding:6px 0;text-align:right;">${safe(service)}</td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Date:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${formatDateWithOrdinal(payload?.date)}
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Time:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${convertTo12Hour(payload?.startTime)} –
            ${convertTo12Hour(payload?.endTime)}
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Consultant:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${safe(payload?.consultant || "To be assigned")}
          </td>
        </tr>

      </table>

      <!-- Invoice Button -->
      <div style="text-align:center;margin:30px 0;">
        <a href="${invoiceUrl}"
           target="_blank"
           style="background:#111827;color:#ffffff;text-decoration:none;
           padding:12px 24px;border-radius:6px;
           font-weight:bold;display:inline-block;">
           View / Download Invoice
        </a>
      </div>

      <p>
        Please keep this email for your records.
      </p>

      <p>
        Warm regards,<br/>
        <strong>SukunLife Team</strong>
      </p>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td align="center"
        style="background:#f9fafb;padding:20px;font-size:13px;color:#6b7280;">
      © 2026 SukunLife BD. All rights reserved.<br/>
      This is an automated confirmation email.
    </td>
  </tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

  try {
    await transporter.sendMail({
      from: `"SukunLife" <${process.env.EMAIL_ID}>`,
      to: customer.email,
      subject,
      html,
      text: `Payment Successful

Invoice: ${invoice}
Amount: ${amount} BDT
Transaction ID: ${trx_id}

Your appointment is confirmed.

– SukunLife`,
    });
  } catch (err) {
    console.error("User confirmation email failed:", err);
  }
}

router.get("/invoice/:invoice", userCheckerMiddleware, async (req, res) => {
  try {
    const invoice = req.params.invoice;

    const payment = await paymentCollection.findOne({
      invoice,
      status: "paid",
    });

    if (!payment) {
      return res.status(404).send("Invoice not found");
    }

    let order = null;

    if (payment.source === "shop") {
      order = await orderCollection.findOne({ invoice });
    }

    res.setHeader("Content-Type", "text/html");
    res.render("invoice-template", {
      payment,
      order,
      printedAt: new Date(),
    });
  } catch (err) {
    console.error("Invoice render failed:", err);
    res.status(500).send("Failed to load invoice");
  }
});

const createOrder = async (payment) => {
  const { items, voucher, deliveryCharge } = payment.payload;
  const calculatedSubtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const order = {
    invoice: payment.invoice,
    paymentId: payment._id,
    customer: payment.customer,
    items,
    voucher,
    subtotal: calculatedSubtotal,
    deliveryCharge,
    totalAmount: payment.amount,
    paymentMethod: payment.payment_method,
    trx_id: payment.trx_id,
    status: "paid",
    orderedAt: new Date(),
    createdAt: new Date(),
  };
  const result = await orderCollection.insertOne(order);
  if (!result.insertedId) {
    throw new Error("Order creation failed");
  }

  for (const item of items) {
    if (item.itemType === "product") {
      await shopCollection.updateOne(
        {
          _id: new ObjectId(item.productId),
          stockQuantity: { $gte: item.quantity },
        },
        {
          $inc: { stockQuantity: -item.quantity },
        },
      );
    } else if (item.itemType === "course") {
      await courseCollection.updateOne(
        {
          _id: new ObjectId(item?.productId),
        },
        { $addToSet: { students: payment?.loggedInUser?._id } },
      );
      await usersCollection.updateOne(
        {
          _id: new ObjectId(payment?.loggedInUser?._id),
        },
        { $addToSet: { enrolledCourses: productId } },
      );
    }
  }

  return { order };
};

async function sendAdminOrderNotificationEmail(order, transporter) {
  const renderVariant = (variant, unit) => {
    const parts = [];
    if (variant?.size) parts.push(`Size: ${variant.size}`);
    if (variant?.color) parts.push(`Color: ${variant.color}`);
    if (unit) parts.push(`Unit: ${unit}`);
    return parts.length ? ` (${parts.join(", ")})` : "";
  };

  const itemsHtml = order.items
    .map(
      (i) => `
    <li>
  <strong>${i.title}</strong><br/>
  Quantity: ${i.quantity}${i.unit ? ` ${i.unit}` : ""}<br/>
  Unit Price: ${i.price} BDT<br/>
  ${renderVariant(i.variant, i.unit)}
</li>
      `,
    )
    .join("");

  const html = `
    <h2>🛒 New Shop Order Received</h2>

    <p><strong>Invoice:</strong> ${order.invoice}</p>
    <p><strong>Total Amount:</strong> ${order.totalAmount} BDT</p>

    <hr/>

    <h3>Customer Details</h3>
    <p>
      Name: ${order.customer.name}<br/>
      Phone: ${order.customer.mobile}<br/>
      Email: ${order.customer.email}<br/>
      Address: ${order.customer.address}
    </p>

    <hr/>

    <h3>Payment Details</h3>
    <p>
      Method: ${order.paymentMethod}<br/>
      Transaction ID: ${order.trx_id}
    </p>

    <hr/>

    <h3>Ordered Items</h3>
    <ul>
      ${itemsHtml}
    </ul>

    <p><strong>Delivery Charge:</strong> ${order.deliveryCharge || 0} BDT</p>

    ${
      order.voucher
        ? `<p><strong>Voucher:</strong> ${order.voucher.code} (-${order.voucher.discount} BDT)</p>`
        : ""
    }

    <p><em>Order placed at ${new Date(order.orderedAt).toLocaleString()}</em></p>
  `;

  await transporter.sendMail({
    from: '"SukunLife" <no-reply@sukunlife.com>',
    to: "sukunlifebd@gmail.com, sukunlifebd2@gmail.com",
    subject: "🛒 New Shop Order Received",
    html,
  });
}
async function sendUserOrderInvoiceEmail(order, transporter) {
  const html = generateInvoiceHTML(order);
  const pdfBuffer = await generateInvoicePDF(html);
  await transporter.sendMail({
    from: '"SukunLife" <no-reply@sukunlife.com>',
    to: order.customer.email,
    subject: "🧾 Your Order Invoice - SukunLife",
    html: `
      <p>Hello <strong>${order.customer.name}</strong>,</p>
      <p>Your invoice is attached as a PDF.</p>
      <p>
        <a href="${process.env.SERVER_URL}/api/paystation/invoice/${order.invoice}">
          View invoice online
        </a>
      </p>
    `,
    attachments: [
      {
        filename: `invoice-${order.invoice}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export default router;
