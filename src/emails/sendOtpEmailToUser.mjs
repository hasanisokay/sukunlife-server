const sendOtpEmailToUser = async (to, name, otp, transporter) => {
    const generateEmailHTML = (name, otp) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>OTP Verification</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
              }
              .email-container {
                  max-width: 400px;
                  margin: 40px auto;
                  background-color: #ffffff;
                  border-radius: 8px;
                  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                  text-align: center;
                  padding: 20px;
              }
              .email-header {
                  background-color: #5a9433;
                  color: #ffffff;
                  padding: 15px;
                  border-radius: 8px 8px 0 0;
              }
              .email-header h2 {
                  margin: 0;
                  font-size: 22px;
              }
              .email-body {
                  padding: 20px;
                  color: #333333;
              }
              .otp-code {
                  display: inline-block;
                  font-size: 24px;
                  font-weight: bold;
                  color: #5a9433;
                  background: #f4f4f4;
                  padding: 10px 20px;
                  border-radius: 5px;
                  margin: 10px 0;
              }
              .email-footer {
                  font-size: 14px;
                  color: #666666;
                  margin-top: 20px;
              }
          </style>
      </head>
      <body>
          <div class="email-container">
              <div class="email-header">
                  <h2>OTP Verification</h2>
              </div>
              <div class="email-body">
                  <p>Dear ${name},</p>
                  <p>Your OTP code for verification is:</p>
                  <div class="otp-code">${otp}</div>
                  <p>Please enter this code to complete your verification. It will be valid for 30 minutes.</p>
              </div>
              <div class="email-footer">
                  © 2025 SukunLife BD. All rights reserved.
              </div>
          </div>
      </body>
      </html>
    `;

    // Define email options
    const mailOptions = {
        to: to,
        subject: "Your OTP Code - SukunLife",
        html: generateEmailHTML(name, otp),
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        if (result?.messageId) {
            return { status: 200, message: "Email sent successfully" };
        } else {
            return { status: 400, message: "Email not sent" };
        }
    } catch (error) {
        return { status: 500, message: `Error sending email: ${error.message}` };
    }
};

export default sendOtpEmailToUser;
