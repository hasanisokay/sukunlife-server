import {
  capitalize,
  convertTo12Hour,
  formatDateWithOrdinal,
} from "./convertDateToDateObject.mjs";

const sendUserBookingConfirmationEmail = async (bookingData, transporter) => {
  const generateUserEmailHTML = (bookingData) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Appointment Confirmation</title>
  </head>
  <body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">
    <div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;overflow:hidden;">
      <div style="background:#5a9433;color:#fff;text-align:center;padding:20px;">
        <h2>Your Appointment is Confirmed</h2>
      </div>
      <div style="padding:20px;color:#333;">
        <p>Hi <strong>${bookingData.name}</strong>,</p>
        <p>Thank you for booking with <strong>SukunLife</strong>. Here are your appointment details:</p>

        <ul style="list-style:none;padding:0;">
          <li><strong>Service:</strong> ${capitalize(bookingData.service)}</li>
          <li><strong>Date:</strong> ${formatDateWithOrdinal(bookingData.date)}</li>
          <li><strong>Start Time: </strong> ${convertTo12Hour(bookingData?.startTime)}</li>
          <li><strong>End Time: </strong> ${convertTo12Hour(bookingData?.endTime)}</li>
          <li><strong>Consultant:</strong> ${bookingData.consultant || "N/A"}</li>
          <li><strong>Reference:</strong> ${bookingData.reference || "N/A"}</li>
            <li><strong>Problem:</strong> ${bookingData?.problem}</li>
        </ul>

        <p>We will contact you shortly if needed.</p>
        <p>Best regards,<br/>SukunLife Team</p>
      </div>
      <div style="background:#f4f4f4;text-align:center;padding:10px;font-size:14px;color:#666;">
        © 2025 SukunLife BD. All rights reserved.
      </div>
    </div>
  </body>
  </html>
  `;

  const mailOptions = {
    from: '"SukunLife" <no-reply@sukunlife.com>',
    to: bookingData.email,
    subject: "Your Appointment is Confirmed - SukunLife",
    html: generateUserEmailHTML(bookingData),
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    if (result?.messageId) {
      return { status: 200, message: "User email sent successfully" };
    } else {
      return { status: 400, message: "User email not sent" };
    }
  } catch (error) {
    return {
      status: 500,
      message: `Error sending user email: ${error.message}`,
    };
  }
};

export default sendUserBookingConfirmationEmail;
