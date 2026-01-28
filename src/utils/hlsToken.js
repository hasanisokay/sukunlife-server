import crypto from "crypto";

const SECRET = process.env.HLS_SECRET || "super-secret-key";
const EXPIRY_SECONDS = 60 * 10; // 10 minutes

export function createHLSToken(userId, courseId, videoId) {
  const exp = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const payload = `${userId}|${courseId}|${videoId}|${exp}`;

  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");

  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyHLSToken(token, userId, courseId, videoId) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [uid, cid, vid, exp, sig] = decoded.split("|");

    if (uid !== userId) return false;
    if (cid !== courseId) return false;
    if (vid !== videoId) return false;
    if (Date.now() / 1000 > Number(exp)) return false;

    const payload = `${uid}|${cid}|${vid}|${exp}`;
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
