import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET; 
const SESSION_COOKIE_NAME = "acs_token";
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token missing or invalid." });
    }
    const token = req.cookies?.SESSION_COOKIE_NAME || req.headers.authorization?.split(" ")[1];
    // const token = authHeader.split(" ")[1];
    const sessionId = req.cookies.sessionId;
    if (!sessionId) {
      return res.status(401).json({ message: "Session ID missing or invalid." });
    }
    const decoded = jwt.verify(token, SECRET_KEY);

    if (decoded.sessionId !== sessionId) {
      return res.status(401).json({ message: "Session mismatch." });
    }

    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) {
      return res.status(401).json({ message: "Session expired or invalid." });
    }
    req.user = { userId: decoded.userId, sessionId };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Authentication failed." });
  }
};

export default authenticate;
