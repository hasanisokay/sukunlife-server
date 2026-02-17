import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { redisConnection } from "../config/redis.mjs";
import {
  sendAdminBookingConfirmationEmail,
  sendAdminOrderNotificationEmail,
  sendOtpEmailToUser,
  sendUserBookingConfirmationEmail,
  sendUserOrderInvoiceEmail,
  sendUserPaymentConfirmationEmail,
} from "../emails/index.mjs";

// Create transporter (reuse across all emails)
let transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_SERVICE_HOST),
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASS,
  },
});

export const emailWorker = new Worker(
  "email-sending",
  async (job) => {
    // const { type, data } = job.data;
        const type = job.name;
    const data = job.data;

    console.log(`📧 Processing email: ${type} - Job ID: ${job.id}`);

    let result;

    switch (type) {
      case "admin-booking-confirmation":
        result = await sendAdminBookingConfirmationEmail(data, transporter);
        break;

      case "user-booking-confirmation":
        result = await sendUserBookingConfirmationEmail(data, transporter);
        break;

      case "user-booking-payment-confirmation":
        result = await sendUserPaymentConfirmationEmail(data, transporter);
        break;
      case "admin-order-notification":
        result = await sendAdminOrderNotificationEmail(data, transporter);
        break;
      case "user-order-invoice":
        result = await sendUserOrderInvoiceEmail(data, transporter);
        break;

      case "password-reset":
        const { to, name, otp } = data;
        result = await sendOtpEmailToUser(to, name, otp, transporter);
        break;

      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    if (result.status !== 200) {
      throw new Error(result.message || "Email sending failed");
    }

    console.log(`✅ Email sent: ${type} - ${result.message}`);

    return {
      success: true,
      type,
      message: result.message,
      sentAt: new Date().toISOString(),
    };
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
);

emailWorker.on("completed", (job, result) => {
  console.log(`✅ Email job completed: ${job.id} - ${result.type}`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`❌ Email job failed: ${job?.id} - ${err.message}`);
});

emailWorker.on("error", (err) => {
  console.error("❌ Email worker error:", err);
});

console.log("📧 Email worker started");
