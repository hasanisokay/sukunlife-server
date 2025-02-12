const sendOrderEmailToUser = async (orderDetails, to, transporter) => {

  // Generate dynamic HTML content for the email
  const generateEmailHTML = (order) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation - SukunLife</title>
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
            .order-summary {
                margin-top: 20px;
                border-top: 1px solid #ddd;
                padding-top: 20px;
            }
            .order-summary table {
                width: 100%;
                border-collapse: collapse;
            }
            .order-summary th, .order-summary td {
                text-align: left;
                padding: 10px;
                border-bottom: 1px solid #ddd;
            }
            .order-summary th {
                background-color: #f9f9f9;
            }
            .total-row td {
                font-weight: bold;
                color: #5a9433;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="email-header">
                <h2>Order Confirmation</h2>
            </div>
            <div class="email-body">
                <p>Dear ${order.name},</p>
                <p>Thank you for your order! Below are the details of your purchase:</p>
                <ul>
                    <li><strong>Name:</strong> ${order.name}</li>
                    <li><strong>Phone:</strong> ${order.phone}</li>
                    <li><strong>Email:</strong> ${order.email}</li>
                    <li><strong>Address:</strong> ${order.address}</li>
                    <li><strong>Transaction ID:</strong> ${order.transactionId}</li>
                </ul>

                <div class="order-summary">
                    <h3>Order Summary</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${order.cartItems.map(item => `
                                <tr>
                                    <td>${item.title}</td>
                                    <td>${item.quantity} ${item.unit || ""}</td>
                                    <td>৳${item.price}</td>
                                    <td>৳${item.price * item.quantity}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3">Subtotal:</td>
                                <td>৳${order.subtotalPrice}</td>
                            </tr>
                            <tr>
                                <td colspan="3">Discount:</td>
                                <td>৳${order.discount} ${order.voucher ? `(${order.voucher})` : ""}</td>
                            </tr>
                            <tr>
                                <td colspan="3">Delivery Charge:</td>
                                <td>৳${order.deliveryCharge}</td>
                            </tr>
                            <tr class="total-row">
                                <td colspan="3">Total:</td>
                                <td>৳${order.finalTotalPrice}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <p>If you have any questions, feel free to contact us.</p>
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
    to: to, // User's email address
    subject: "Order Confirmation - SukunLife",
    html: generateEmailHTML(orderDetails), // Dynamically generated HTML
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

export default sendOrderEmailToUser;