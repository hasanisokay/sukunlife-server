async function sendAdminOrderNotificationEmail(order, transporter) {
  const renderVariant = (variant, unit) => {
    const parts = [];
    if (variant?.size) parts.push(`Size: ${variant.size}`);
    if (variant?.color) parts.push(`Color: ${variant.color}`);
    if (unit) parts.push(`Unit: ${unit}`);
    return parts.length ? ` (${parts.join(", ")})` : "";
  };

  const itemsHtml = order.items
    .map(
      (i) => `
    <li>
  <strong>${i.title}</strong><br/>
  Quantity: ${i.quantity}${i.unit ? ` ${i.unit}` : ""}<br/>
  Unit Price: ${i.price} BDT<br/>
  ${renderVariant(i.variant, i.unit)}
</li>
      `,
    )
    .join("");

  const html = `
    <h2>🛒 New Shop Order Received</h2>

    <p><strong>Invoice:</strong> ${order.invoice}</p>
    <p><strong>Total Amount:</strong> ${order.totalAmount} BDT</p>

    <hr/>

    <h3>Customer Details</h3>
    <p>
      Name: ${order.customer.name}<br/>
      Phone: ${order.customer.mobile}<br/>
      Email: ${order.customer.email}<br/>
      Address: ${order.customer.address}
    </p>

    <hr/>

    <h3>Payment Details</h3>
    <p>
      Method: ${order.paymentMethod}<br/>
      Transaction ID: ${order.trx_id}
    </p>

    <hr/>

    <h3>Ordered Items</h3>
    <ul>
      ${itemsHtml}
    </ul>

    <p><strong>Delivery Charge:</strong> ${order.deliveryCharge || 0} BDT</p>

    ${
      order.voucher
        ? `<p><strong>Voucher:</strong> ${order.voucher.code} (-${order.voucher.discount} BDT)</p>`
        : ""
    }

    <p><em>Order placed at ${new Date(order.orderedAt).toLocaleString()}</em></p>
  `;

  await transporter.sendMail({
    from: '"SukunLife" <no-reply@sukunlife.com>',
    to: "sukunlifebd@gmail.com, sukunlifebd2@gmail.com",
    subject: "🛒 New Shop Order Received",
    html,
  });
}
export default sendAdminOrderNotificationEmail;