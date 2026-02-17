import { generateInvoiceHTML } from "../utils/generateInvoiceHTML.mjs";
import { generateInvoicePDF } from "../utils/generateInvoicePDF.mjs";



async function sendUserOrderInvoiceEmail(order, transporter) {
  const html = generateInvoiceHTML(order);
  const pdfBuffer = await generateInvoicePDF(html);
  await transporter.sendMail({
    from: '"SukunLife" <no-reply@sukunlife.com>',
    to: order.customer.email,
    subject: "🧾 Your Order Invoice - SukunLife",
    html: `
      <p>Hello <strong>${order.customer.name}</strong>,</p>
      <p>Your invoice is attached as a PDF.</p>
      <p>
        <a href="${process.env.SERVER_URL}/api/paystation/invoice/${order.invoice}">
          View invoice online
        </a>
      </p>
    `,
    attachments: [
      {
        filename: `invoice-${order.invoice}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
export default sendUserOrderInvoiceEmail;