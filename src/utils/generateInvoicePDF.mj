import puppeteer from "puppeteer";

export async function generateInvoicePDF(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // DO NOT WAIT FOR NETWORK
  await page.setContent(html, {
    waitUntil: "load",
    timeout: 0
  });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
}
