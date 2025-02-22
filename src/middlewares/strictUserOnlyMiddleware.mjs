import jwt from "jsonwebtoken";
import cookie from "cookie";
import { ACCESS_TOKEN_SECRET_KEY } from "../constants/names.mjs";
import { ObjectId } from "mongodb";
import dbConnect from "../config/db.mjs";

const db = await dbConnect();
const usersCollection = db.collection("users");

const strictUserOnlyMiddleware = async (req, res, next) => {
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
      const userFromToken = decoded?.user;
      const userFromDb = await usersCollection.findOne(
        { _id: new ObjectId(userFromToken?._id) },
        { projection: { _id: 1, role: 1, status: 1 } }
      );
      if (!userFromDb) {
        return res
          .status(403)
          .json({
            message: "Forbidden: Users only. User Not found.",
            status: 403,
          });
      }
      if (userFromDb.role !== "user" && userFromDb.status !== "active") {
        return res
          .status(403)
          .json({ message: "Forbidden: Users only", status: 403 });
      }
      req.user = userFromToken;
      next();
    } else {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user found.", status: 401 });
    }
  } catch (error) {
    return res.status(403).json({
      message: "Forbidden: Invalid Token or server error",
      status: 403,
    });
  }
};

export default strictUserOnlyMiddleware;
