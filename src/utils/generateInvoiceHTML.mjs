export function generateInvoiceHTML(order) {
  const printedAt = new Date();
  const invoiceUrl = `${process.env.SERVER_URL}/api/paystation/invoice/${order.invoice}`;

  const itemsHtml = order.items.map(item => `
<tr>
<td>
  <strong>${item.title}</strong><br/>
  Qty: ${item.quantity}${item.unit ? " " + item.unit : ""}<br/>
  <small>
    Unit price: ${item.price} BDT${item.unit ? " / " + item.unit : ""}
  </small>
  ${
    item.variant
      ? `<br/><small>
          ${item.variant.size ? "Size: " + item.variant.size : ""}
          ${item.variant.color ? ", Color: " + item.variant.color : ""}
        </small>`
      : ""
  }
</td>
<td style="text-align:right;">${item.price * item.quantity} BDT</td>
</tr>
`).join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice ${order.invoice}</title>

<style>
* { box-sizing: border-box; }

@page {
  margin: 60px 25px 80px 25px;
}

body {
  font-family: "Segoe UI", Tahoma, Arial, sans-serif;
  background: #ffffff;
  margin: 0;
  padding: 0;
  color: #2e3e23;
}

/* Page number */
.page-number {
  position: fixed;
  top: 15px;
  right: 25px;
  font-size: 10px;
  color: #6b7280;
}
.page-number:after {
  content: "Page " counter(page+1);
}

/* Watermark */
.watermark {
  position: fixed;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-25deg);
  font-size: 100px;
  color: rgba(46, 62, 35, 0.08);
  font-weight: 700;
  z-index: 0;
  pointer-events: none;
}

/* Main container */
.invoice-container {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: auto;
  background: #ffffff;
  padding: 30px 25px 120px 25px;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 20px;
  margin-bottom: 30px;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logo {
  width: 170px;
}

.qr {
  width: 90px;
  height: 90px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.info-box {
  background: #f9fafb;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
}

/* Table */
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 30px;
}

tr { page-break-inside: avoid; }

th, td {
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12.5px;
}

th { background: #f3f4f6; }

.total {
  display: flex;
  justify-content: flex-end;
}

.total-box {
  width: 280px;
  background: #f9fafb;
  padding: 15px;
  border-radius: 6px;
  font-size: 13px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.final {
  font-size: 15px;
  font-weight: bold;
  border-top: 1px solid #e5e7eb;
  padding-top: 8px;
}

/* Fixed footer */
.footer {
  position: fixed;
  bottom: 20px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 9px;
  color: #6b7280;
}
</style>
</head>

<body>

<div class="page-number"></div>
<div class="watermark">PAID</div>

<div class="invoice-container">

  <div class="header">
    <div class="brand">
      <img src="https://sukunlife.github.io/audio/logo.jpg" class="logo"/>
      <p>
        Dhanmondi 32<br/>
        Near Sobhanbag Jame Mosque<br/>
        Dhanmondi, Dhaka.
      </p>
      <p>01915109430</p>
    </div>

    <div style="text-align:right;">
      <h2>Invoice</h2>
      <p># ${order.invoice}</p>
      <img 
        class="qr"
        src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(invoiceUrl)}"
        alt="QR Code"
      />
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <h4>Billed To</h4>
      <p><strong>${order.customer.name}</strong></p>
      <p>${order.customer.email}</p>
      <p>${order.customer.mobile}</p>
    </div>

    <div class="info-box">
      <h4>Invoice Info</h4>
      <p><strong>Date:</strong> ${printedAt.toLocaleDateString()}</p>
      <p><strong>Status:</strong> Paid</p>
      <p><strong>Payment:</strong> ${order.paymentMethod}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="total">
    <div class="total-box">

      <div class="total-row">
        <span>Subtotal</span>
        <span>${order.subtotal} BDT</span>
      </div>

      ${order.voucher ? `
      <div class="total-row">
        <span>Discount</span>
        <span>-${order.voucher.discount} BDT</span>
      </div>` : ""}

      <div class="total-row">
        <span>Delivery</span>
        <span>${order.deliveryCharge} BDT</span>
      </div>

      <div class="total-row final">
        <span>Total Paid</span>
        <span>${order.totalAmount} BDT</span>
      </div>

    </div>
  </div>

</div>

<div class="footer">
  <p>Thank you for choosing <strong>SukunLife</strong>.</p>
  <p>This invoice was generated electronically and does not require a signature.</p>
</div>

</body>
</html>
`;
}
