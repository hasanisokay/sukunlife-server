import { capitalize, convertTo12Hour, formatDateWithOrdinal } from "../utils/convertDateToDateObject.mjs";

const sendAdminBookingConfirmationEmail = async (bookingData, transporter) => {
const generateEmailHTML = (bookingData) => {
  const {
    name,
    mobile,
    email,
    address,
    service,
    date,
    startTime,
    endTime,
    consultant,
    reference,
    problem,
    advancePayment,
    trx_id,
  } = bookingData;

  const displayService =
    service === "emergency-ruqyah"
      ? "Emergency Ruqyah"
      : capitalize(service);

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>New Appointment</title>
</head>

<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">

<table width="650" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);">

  <!-- Header -->
  <tr>
    <td style="padding:30px 40px 20px 40px;">
      <h2 style="margin:0;color:#111827;font-weight:600;">
        New Appointment
      </h2>
      <p style="margin:6px 0 0 0;color:#6b7280;font-size:14px;">
        A new booking has been submitted.
      </p>
    </td>
  </tr>

  <!-- Status Badge -->
  <tr>
    <td style="padding:0 40px;">
      <div style="
        display:inline-block;
        background:#111827;
        color:#ffffff;
        font-size:12px;
        padding:6px 12px;
        border-radius:20px;
        letter-spacing:1px;">
        NEW BOOKING
      </div>
    </td>
  </tr>

  <!-- Booking Card -->
  <tr>
    <td style="padding:25px 40px;">

      <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;padding:20px;">

        <tr>
          <td style="padding:8px 0;"><strong>Name:</strong></td>
          <td style="padding:8px 0;text-align:right;">${name}</td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Phone:</strong></td>
          <td style="padding:8px 0;text-align:right;">${mobile}</td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Email:</strong></td>
          <td style="padding:8px 0;text-align:right;">${email}</td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Address:</strong></td>
          <td style="padding:8px 0;text-align:right;">${address || "N/A"}</td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Service:</strong></td>
          <td style="padding:8px 0;text-align:right;font-weight:600;">
            ${displayService}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Date:</strong></td>
          <td style="padding:8px 0;text-align:right;">
            ${formatDateWithOrdinal(date)}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Time:</strong></td>
          <td style="padding:8px 0;text-align:right;">
            ${convertTo12Hour(startTime)} – ${convertTo12Hour(endTime)}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Consultant:</strong></td>
          <td style="padding:8px 0;text-align:right;">
            ${consultant || "Not Assigned"}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 0;"><strong>Reference:</strong></td>
          <td style="padding:8px 0;text-align:right;">
            ${reference || "N/A"}
          </td>
        </tr>

        ${
          problem
            ? `
        <tr>
          <td style="padding:8px 0;vertical-align:top;"><strong>Problem:</strong></td>
          <td style="padding:8px 0;text-align:right;">
            ${problem}
          </td>
        </tr>
        `
            : ""
        }

      </table>

    </td>
  </tr>

  <!-- Payment Section -->
  <tr>
    <td style="padding:0 40px 30px 40px;">

      <div style="
        background:#fef3c7;
        border:1px solid #fcd34d;
        padding:15px 20px;
        border-radius:10px;
        font-size:14px;
        color:#92400e;">

        <strong>Advance Payment:</strong><br/>

        ${
          advancePayment
            ? `Received — Transaction ID: <strong>${trx_id}</strong>`
            : "No advance payment"
        }

      </div>

    </td>
  </tr>

  <!-- Quick Actions -->
  <tr>
    <td align="center" style="padding-bottom:30px;">

      <a href="https://wa.me/880${mobile?.replace(/^0/, "")}"
         target="_blank"
         style="background:#25D366;color:#ffffff;text-decoration:none;
         padding:12px 22px;border-radius:6px;font-weight:bold;margin:5px;">
         WhatsApp Client
      </a>

      <a href="mailto:${email}"
         style="background:#111827;color:#ffffff;text-decoration:none;
         padding:12px 22px;border-radius:6px;font-weight:bold;margin:5px;">
         Email Client
      </a>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td align="center"
        style="background:#f9fafb;padding:20px;font-size:13px;color:#6b7280;">
      © 2026 SukunLife BD. Admin Notification
    </td>
  </tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;
};


  // Define email option
  let mailOptions = {
    from: '"SukunLife" <no-reply@sukunlife.com>',
    // to: "sukunlifebd@gmail.com, sukunlifebd2@gmail.com",
    to: "devhasanvibes@gmail.com",
    subject: "New Appointment - SukunLife",
    html: generateEmailHTML(bookingData),
  };

  try {
    // Send the email
    const result = await transporter.sendMail(mailOptions);
    if (result?.messageId) {
      return { status: 200, message: "Email sent successfully" };
    } else {
      return { status: 400, message: "Email Not Sent" };
    }
  } catch (error) {
    return { status: 500, message: `Error sending email: ${error.message}` };
  }
};

export default sendAdminBookingConfirmationEmail;
