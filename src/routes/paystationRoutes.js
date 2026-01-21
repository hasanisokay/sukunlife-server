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

router.get("/callback", async (req, res) => {
  const { status, invoice_number, message } = req.query;

  const payment = await paymentCollection.findOne({
    invoice: invoice_number,
  });
  if (!payment) {
    return res.redirect(
      `${process.env.CLIENT_URL}/payment-failed?message=Invalid invoice`,
    );
  }

  // Failed at PayStation
  if (status?.toLowerCase() !== "successful") {
    await paymentCollection.updateOne(
      { invoice: invoice_number },
      { $set: { status: "failed" } },
    );

    return res.redirect(
      `${process.env.CLIENT_URL}/payment-failed?invoice=${invoice_number}&message=${encodeURIComponent(
        message || "Payment failed",
      )}`,
    );
  }

  try {
    const verification = await verifyPayment(invoice_number);
    const v = verification?.data;
    console.log({ verification });

    if (
      verification?.status?.toLowerCase() !== "success" ||
      v?.trx_status?.toLowerCase() !== "successful" ||
      Number(v?.request_amount) !== payment.amount
    ) {
      await paymentCollection.updateOne(
        { invoice: invoice_number },
        { $set: { status: "failed" } },
      );

      return res.redirect(
        `${process.env.CLIENT_URL}/payment-failed?invoice=${invoice_number}&message=${encodeURIComponent(
          "Payment verification failed",
        )}`,
      );
    }

    //  Mark paid
    await paymentCollection.updateOne(
      { invoice: invoice_number },
      {
        $set: {
          status: "paid",
          trx_id: v.trx_id,
          paidAt: new Date(),
          raw_response: verification,
        },
      },
    );

    // Fulfillment
    switch (payment.source) {
      case "appointment":
        await createAppointment(payment);
        break;

      case "shop":
        await createOrder(payment);
        break;

      default:
        throw new Error("Unknown payment source");
    }
    try {
      const dataForEmail = {
        ...payment,
        trx_id: verification?.data?.trx_id,
        payment_method: verification?.data?.payment_method,
      };
      await sendUserPaymentConfirmationEmail(dataForEmail, transporter);
    } catch (err) {
      console.error("User confirmation email failed:", err);
    }
    return res.redirect(
      `${process.env.CLIENT_URL}/payment-success?invoice=${invoice_number}&source=${payment.source}`,
    );
  } catch (err) {
    return res.redirect(
      `${process.env.CLIENT_URL}/payment-failed?invoice=${invoice_number}&message=Server error`,
    );
  }
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

  const html = `
    <h2>Payment Successful</h2>
    <p>Thank you, ${payment.customer.name}.</p>
    <p>Your payment has been successfully received.</p>

    <p><strong>Invoice:</strong> ${payment.invoice}</p>
    <p><strong>Amount:</strong> ${payment.amount} BDT</p>
    <p><strong>Payment Method:</strong> ${payment?.payment_method}</p>
    <p><strong>TrxId:</strong> ${payment?.trx_id}</p>

    <hr />

    ${
      payment.source === "appointment"
        ? `<p>Your appointment has been booked successfully.</p>`
        : `<p>Your order is now being processed.</p>`
    }

    <p>You can keep this email for your records.</p>
  `;

  await transporter.sendMail({
    from: `"SukunLife" <${process.env.EMAIL_ID}>`,
    to: payment?.customer?.email,
    subject,
    html,
  });
}

export default router;
