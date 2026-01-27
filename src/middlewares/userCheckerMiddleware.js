import jwt from "jsonwebtoken";
import cookie from "cookie";
import { ACCESS_TOKEN_SECRET_KEY } from "../constants/names.mjs";
const userCheckerMiddleware = (req, res, next) => {
  try {
    const cookies = cookie.parse(req?.headers?.cookie || "");
    const accessToken = cookies?.acs_token || req?.headers?.authorization?.split(' ')[1];
    console.log({accessToken})
    if (!accessToken) {
      req.user = null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(accessToken, ACCESS_TOKEN_SECRET_KEY);
    } catch (e) {
      console.error(e);
      req.user = null;
      next();
    }
    req.user = decoded?.user;
    next();
  } catch (error) {
    console.error("User checker middleware error:", error);
    return next();
  }
};

export default userCheckerMiddleware;
