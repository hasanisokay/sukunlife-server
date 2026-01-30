import crypto from "crypto";

const SECRET = process.env.HLS_SECRET || "super-secret-key";
const EXPIRY_SECONDS = 60 * 10; // 10 minutes

export function createFileToken(userId, courseId, filename) {
  const exp = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const payload = `${userId}|${courseId}|${filename}|${exp}`;

  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");

  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyFileToken(token, userId, courseId, filename) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [uid, cid, fname, exp, sig] = decoded.split("|");

    if (uid !== userId) return false;
    if (cid !== courseId) return false;
    if (fname !== filename) return false;
    if (Date.now() / 1000 > Number(exp)) return false;

    const payload = `${uid}|${cid}|${fname}|${exp}`;
    const expectedSig = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSig)
    );
  } catch {
    return false;
  }
}
