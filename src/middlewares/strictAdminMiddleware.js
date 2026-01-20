import jwt from "jsonwebtoken";
import cookie from "cookie";
import { ACCESS_TOKEN_SECRET_KEY } from "../constants/names.mjs";
import dbConnect from "../config/db.mjs";
import { ObjectId } from "mongodb";

const db = await dbConnect();
const usersCollection = db?.collection("users");

const strictAdminMiddleware = async (req, res, next) => {
  // This will check the token and as well as db to ensure the token permission match with db.
  try {
    const cookies = cookie.parse(req.headers?.cookie || "");
    const accessToken = cookies.acs_token || req?.headers?.authorization?.split(' ')[1];
    const refreshToken = cookies.rfr_token || req?.headers?.['x-refresh-token'];
    if (!accessToken || !refreshToken) {
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
    const userFromToken = decoded?.user;
    const userFromDb = await usersCollection.findOne(
      { _id: new ObjectId(userFromToken?._id) },
      {projection:{ _id: 1, role: 1, status: 1 }}
    );
    if (!userFromDb) {
      return res
        .status(403)
        .json({ message: "Forbidden: Admins only. User Not found.", status: 403 });
    }
    if (userFromDb.role !== "admin" && userFromDb.status !== "active") {
      return res
        .status(403)
        .json({ message: "Forbidden: Admins only", status: 403 });
    }
    req.user = userFromToken;
    next();
  } catch (error) {
    console.log("Admin middleware error:", error);
    return res
      .status(403)
      .json({ message: "Forbidden: Invalid token", status: 403 });
  }
};

export default strictAdminMiddleware;
