import crypto from "crypto";

const SECRET = process.env.HLS_SECRET || "super-secret-key";

/**
 * Creates an HLS token for streaming video content
 * Token is valid as long as the user has access to the course
 */
export function createHLSToken(userId, courseId, videoId) {
  const payload = `${userId}|${courseId}|${videoId}`;

  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");

  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

/**
 * Verifies an HLS token
 * Returns true if token signature is valid, false otherwise
 */
export function verifyHLSToken(token, userId, courseId, videoId) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split("|");

    // Token format: userId|courseId|videoId|signature
    if (parts.length !== 4) {
      console.error("Invalid token format: expected 4 parts, got", parts.length);
      return false;
    }

    const [uid, cid, vid, sig] = parts;

    // Verify all parts match
    if (uid !== userId) {
      console.error("UserId mismatch");
      return false;
    }
    if (cid !== courseId) {
      console.error("CourseId mismatch");
      return false;
    }
    if (vid !== videoId) {
      console.error("VideoId mismatch");
      return false;
    }

    // Verify signature
    const payload = `${uid}|${cid}|${vid}`;
    const expectedSig = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSig)
    );
  } catch (err) {
    console.error("Token verification error:", err);
    return false;
  }
}