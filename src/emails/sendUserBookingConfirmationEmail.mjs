import { capitalize, convertTo12Hour, formatDateWithOrdinal } from "../utils/convertDateToDateObject.mjs";


const sendUserBookingConfirmationEmail = async (bookingData, transporter) => {
const generateUserEmailHTML = (bookingData) => {
  const {
    name,
    service,
    date,
    startTime,
    endTime,
    consultant,
    reference,
    problem,
  } = bookingData;

  const formattedDate = formatDateWithOrdinal(date);
  const formattedStart = convertTo12Hour(startTime);
  const formattedEnd = convertTo12Hour(endTime);

  // Google Calendar Link Generator
  const googleCalendarLink = `
https://calendar.google.com/calendar/render?action=TEMPLATE
&text=SukunLife Appointment
&details=Service: ${capitalize(service)} | Reference: ${reference || "N/A"}
&dates=${date.replaceAll("-", "")}T${startTime.replace(":", "")}00/
${date.replaceAll("-", "")}T${endTime.replace(":", "")}00
`;
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
<title>Appointment Confirmation</title>
</head>

<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.06);">

  <!-- Logo Header (Minimal Modern) -->
  <tr>
    <td align="center" style="padding:30px 20px 10px 20px;">
      <img src="https://sukunlife.github.io/audio/logo.jpg"
           alt="SukunLife Logo"
           width="180"
           style="display:block;margin-bottom:10px;border-radius:6px;" />
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td>
      <hr style="border:none;border-top:1px solid #eeeeee;margin:0 40px;">
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:30px 40px;color:#333;font-size:15px;line-height:1.7;">

      <h2 style="margin-top:0;font-weight:600;color:#1f2937;">
        Appointment Confirmed
      </h2>

      <p>Hi <strong>${name}</strong>,</p>

      <p>
        Your session with <strong>SukunLife</strong> has been successfully scheduled.
        Below are your appointment details:
      </p>

      <!-- Appointment Card -->
      <table width="100%" cellpadding="0" cellspacing="0"
        style="margin:25px 0;padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">

       <tr>
  <td style="padding:6px 0;"><strong>Service:</strong></td>
  <td style="padding:6px 0;text-align:right;">
    ${displayService}
  </td>
</tr>


        <tr>
          <td style="padding:6px 0;"><strong>Date:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${formattedDate}
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Time:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${formattedStart} – ${formattedEnd}
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Consultant:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${consultant || "To be assigned"}
          </td>
        </tr>

        <tr>
          <td style="padding:6px 0;"><strong>Reference:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${reference || "N/A"}
          </td>
        </tr>

        ${
          problem
            ? `
        <tr>
          <td style="padding:6px 0;vertical-align:top;"><strong>Concern:</strong></td>
          <td style="padding:6px 0;text-align:right;">
            ${problem}
          </td>
        </tr>
        `
            : ""
        }

      </table>

      <!-- Buttons Section -->
      <div style="text-align:center;margin:30px 0;">

        <!-- Google Calendar -->
        <a href="${googleCalendarLink}"
           target="_blank"
           style="background:#1a73e8;color:#ffffff;text-decoration:none;
           padding:12px 22px;border-radius:6px;display:inline-block;
           font-weight:bold;margin:5px;">
           Add to Google Calendar
        </a>

        <!-- WhatsApp -->
        <a href="https://wa.me/8801887753555"
           target="_blank"
           style="background:#25D366;color:#ffffff;text-decoration:none;
           padding:12px 22px;border-radius:6px;display:inline-block;
           font-weight:bold;margin:5px;">
           WhatsApp Support
        </a>

      </div>


      <p>
        We look forward to supporting your well-being journey. We will contact you shortly if needed.
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
      This is an automated email. Please do not reply.
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
