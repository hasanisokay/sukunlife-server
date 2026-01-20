import convertTo12HourFormat from "../utils/convertTo12HourFormat.mjs";
const sendAdminBookingConfirmationEmail = async (bookingData, transporter) => {
  const generateEmailHTML = (bookingData) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Appointment</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .email-header {
                    background-color: #5a9433;
                    color: #ffffff;
                    text-align: center;
                    padding: 20px;
                }
                .email-header h2 {
                    margin: 0;
                }
                .email-body {
                    padding: 20px;
                    color: #333333;
                }
                .email-body ul {
                    list-style: none;
                    padding: 0;
                }
                .email-body li {
                    margin-bottom: 10px;
                    font-size: 16px;
                }
                .email-body li strong {
                    color: #5a9433;
                }
                .email-footer {
                    background-color: #f4f4f4;
                    text-align: center;
                    padding: 10px;
                    font-size: 14px;
                    color: #666666;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h2>New Appointment Details</h2>
                </div>
                <div class="email-body">
                    <ul>
                        <li><strong>Name:</strong> ${bookingData.name}</li>
                        <li><strong>Phone Number:</strong> ${
                          bookingData.mobile
                        }</li>
                        <li><strong>Address:</strong> ${
                          bookingData.address
                        }</li>
                        <li><strong>Service:</strong> ${
                          bookingData?.service
                        }</li>
                        <li><strong>Date:</strong> ${bookingData?.date}</li>
                        <li><strong>Time:</strong> ${bookingData?.time}</li>
                         <li><strong>Consultant:</strong> ${bookingData?.consultant || "N/A"}</li>
                         <li><strong>Reference:</strong> ${bookingData?.reference || "N/A"}</li>
                        <li><strong>Problem:</strong> ${
                          bookingData?.problem
                        }</li>
                        <li><strong>Advance Payment:</strong>${
                          bookingData?.advancePayment
                            ? `Trx Id: ${bookingData?.transactionNumber}`
                            : bookingData?.advancePayment
                        }</li>
                    </ul>
                </div>
                <div class="email-footer">
                    © 2025 SukunLife BD. All rights reserved.
                </div>
            </div>
        </body>
        </html>`;

  // Define email options
  let mailOptions = {
    to: "sukunlifebd@gmail.com, sukunlifebd2@gmail.com",
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
