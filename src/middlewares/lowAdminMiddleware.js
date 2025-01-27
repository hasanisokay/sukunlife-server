import jwt from "jsonwebtoken";
import cookie from "cookie";
import { ACCESS_TOKEN_SECRET_KEY } from "../constants/names.mjs";
const lowAdminMiddleware = (req, res, next) => {
  // This will only check if the access token valid or not.
  try {

    const cookies = cookie.parse(req.headers?.cookie || "");
    const accessToken = cookies.acs_token || req?.headers?.authorization?.split(' ')[1];
    if (!accessToken) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided", status: 401 });
    }
    let decoded;
    try {
      decoded = jwt.verify(accessToken, ACCESS_TOKEN_SECRET_KEY);
    } catch (e) {
      console.error(e);
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid Token", status: 401 });
    }

    if (decoded?.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Forbidden: Admins only", status: 403 });
    }

    req.user = decoded?.user;
    next(); 
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(403).json({ message: "Forbidden: Invalid token", status:403 });
  }
};

export default lowAdminMiddleware;
