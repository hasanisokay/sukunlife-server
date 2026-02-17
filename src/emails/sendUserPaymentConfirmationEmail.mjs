import { capitalize, convertTo12Hour, formatDateWithOrdinal } from "../utils/convertDateToDateObject.mjs";

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
        })[s],
    );

  const { invoice, amount, payment_method, trx_id, customer, payload } =
    payment;

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

export default sendUserPaymentConfirmationEmail;