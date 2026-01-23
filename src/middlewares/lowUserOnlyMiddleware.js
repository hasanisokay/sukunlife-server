import jwt from "jsonwebtoken";
import cookie from "cookie";
import { ACCESS_TOKEN_SECRET_KEY } from "../constants/names.mjs";
const lowUserOnlyMiddleware = (req, res, next) => {
  try {
    const cookies = cookie.parse(req?.headers?.cookie || "");
    const accessToken =
      cookies?.acs_token || req?.headers?.authorization?.split(" ")[1];
    if (!accessToken) {
      req.user = null;
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided", status: 401 });
    }

    let decoded;
    try {
      decoded = jwt.verify(accessToken, ACCESS_TOKEN_SECRET_KEY);
    } catch (e) {
      console.error(e);
      req.user = null;
    }
    if (decoded?.user) {
      req.user = decoded?.user;
      next();
    } else {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user found.", status: 401 });
    }
  } catch (error) {
    return res
      .status(403)
      .json({
        message: "Forbidden: Invalid Token or server error",
        status: 403,
      });
  }
};

export default lowUserOnlyMiddleware;
