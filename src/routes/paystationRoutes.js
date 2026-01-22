import express from "express";
import dbConnect from "../config/db.mjs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { ObjectId } from "mongodb";
import convertDateToDateObject from "../utils/convertDateToDateObject.mjs";
import sendAdminBookingConfirmationEmail from "../utils/sendAdminBookingConfirmationEmail.mjs";
import nodemailer from "nodemailer";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";

const router = express.Router();
const db = await dbConnect();
dotenv.config();
const paymentCollection = db?.collection("payments");

const appointmentCollection = db?.collection("appointments");

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
  const { name, mobile, address, email, source } = req.body;

  if (!name || !mobile || !address || !source) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const prefix = getInvoicePrefix(source);
  const invoice = `${prefix}-${new ObjectId().toString()}`;

  const amountMap = {
    appointment: 20,
    shop: 0,
    donation: 0,
  };

  const amount = amountMap[source];
  if (!amount) {
    return res.status(400).json({ message: "Invalid payment source" });
  }

  // Save pending payment FIRST
  await paymentCollection.insertOne({
    invoice,
    prefix,
    source,
    amount,
    status: "pending",
    customer: { name, mobile, email, address },
    payload: req.body, // raw data if needed later
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
});

router.get("/callback", (req, res) => {
  const { status, invoice_number, message } = req.query;

  if (status !== "Successful") {
    return res.redirect(
      `${CLIENT_URL}/payment-failed?invoice=${invoice_number}`,
    );
  }

  return res.redirect(
    `${CLIENT_URL}/payment-success?invoice=${invoice_number}`,
  );
});

// router.get("/verify-payment", async (req, res) => {
//   try {
//     const { invoice_number } = req.query;

//     if (!invoice_number) {
//       return res.status(400).json({
//         success: false,
//         message: "invoice_number is required",
//       });
//     }
//     const verification = await verifyPayment(invoice_number);
//     const v = verification?.data;
//     if (
//       verification?.status?.toLowerCase() === "success" ||
//       v?.trx_status?.toLowerCase() === "successful"
//     ) {
//       await paymentCollection.updateOne(
//         { invoice: invoice_number },
//         {
//           $set: {
//             status: "paid",
//             trx_id: v.trx_id,
//             payment_method: v?.payment_method,
//             paidAt: new Date(),
//             raw_response: verification,
//           },
//         },
//       );
//     }
//     return res.status(200).json(verification);
//   } catch (error) {
//     console.error("Verify payment error:", error);

//     if (error.name === "AbortError") {
//       return res.status(408).json({
//         success: false,
//         message: "Payment verification timed out",
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Failed to verify payment",
//     });
//   }
// });

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

    const payment = await paymentCollection.findOne({
      invoice: invoice_number,
    });

    if (!payment) {
      return res.status(404).json({ message: "Invalid invoice" });
    }

    // 🔁 Idempotency guard
    if (payment.fulfilled) {
      return res.status(200).json({ alreadyProcessed: true });
    }

    // 🔐 Verify with PayStation
    const verification = await verifyPayment(invoice_number);
    const v = verification?.data;

    if (
      verification?.status?.toLowerCase() !== "success" ||
      v?.trx_status?.toLowerCase() !== "successful"
    ) {
      await paymentCollection.updateOne(
        { invoice: invoice_number },
        { $set: { status: "failed" } },
      );
      return res.status(400).json({ message: "Verification failed" });
    }

    // 💰 Mark paid
    await paymentCollection.updateOne(
      { invoice: invoice_number },
      {
        $set: {
          status: "paid",
          trx_id: v.trx_id,
          payment_method: v.payment_method,
          paidAt: new Date(),
          raw_response: verification,
        },
      },
    );

    // 📦 Fulfillment
    if (payment.source === "appointment") {
      await createAppointment(payment);
    }

    if (payment.source === "shop") {
      await createOrder(payment);
    }

    // 📧 Email
    await sendUserPaymentConfirmationEmail(payment, transporter);

    // ✅ Mark fulfilled
    await paymentCollection.updateOne(
      { invoice: invoice_number },
      { $set: { fulfilled: true, fulfilledAt: new Date() } },
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Finalize payment error:", error);
    return res.status(500).json({ message: "Finalize failed" });
  }
});


const createOrder = async (data) => {};
const createAppointment = async (payment) => {
  try {
    const booking = payment.payload;
    const appointment = {
      ...booking,
      invoice: payment.invoice,
      trx_id: payment?.raw_response?.data?.trx_id,
      paymentStatus: "paid",
      bookedDate: convertDateToDateObject(booking.date),
      bookingDate: new Date(),
      createdAt: new Date(),
    };

    const result = await appointmentCollection.insertOne(appointment);

    if (result.insertedId) {
      try {
        await sendAdminBookingConfirmationEmail(appointment, transporter);
      } catch {
        console.log("sending admin email failed");
      }
      return { status: 200 };
    }
  } catch (error) {
    console.error("Appointment creation failed:", error);
    throw error;
  }
};

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

    if (payment.loggedInUser?._id) {
      if (!req.user) {
        return res.status(403).send("Login required to view invoice");
      }

      if (payment.loggedInUser._id.toString() !== req.user._id.toString()) {
        return res.status(403).send("Unauthorized");
      }
    }
    if (payment.loggedInUser?._id) {
      return res.status(403).send("Unauthorized");
    }
    res.setHeader("Content-Type", "text/html");
    res.render("invoice-template", {
      payment,
      printedAt: new Date(),
    });
  } catch (err) {
    console.error("Invoice render failed:", err);
    res.status(500).send("Failed to load invoice");
  }
});

async function sendUserPaymentConfirmationEmail(payment, transporter) {
  const subject =
    payment.source === "appointment"
      ? "Your Appointment is Confirmed"
      : "Your Order is Confirmed";

  const safe = (v = "") =>
    String(v).replace(/[&<>"']/g, s => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[s]));

  const html = `
    <h2>Payment Successful</h2>

    <p>Thank you, ${safe(payment.customer.name)}.</p>
    <p>Your payment has been successfully received.</p>

    <p><strong>Invoice:</strong> ${payment.invoice}</p>
    <p><strong>Amount:</strong> ${payment.amount} BDT</p>
    <p><strong>Payment Method:</strong> ${payment.payment_method}</p>
    <p><strong>Transaction ID:</strong> ${payment.trx_id}</p>

    <hr />

    ${
      payment.source === "appointment"
        ? `<p>Your appointment has been booked successfully.</p>`
        : `<p>Your order is now being processed.</p>`
    }

    <p>
      <a href="${process.env.CLIENT_URL}/payment-success?invoice=${payment.invoice}">
        View / Print Invoice
      </a>
    </p>

    <p>You can keep this email for your records.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"SukunLife" <${process.env.EMAIL_ID}>`,
      to: payment.customer.email,
      subject,
      html,
      text: `Payment successful.
Invoice: ${payment.invoice}
Amount: ${payment.amount} BDT`,
    });
  } catch (err) {
    console.error("User confirmation email failed:", err);
  }
}


export default router;
