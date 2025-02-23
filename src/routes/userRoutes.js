import express from "express";
import dbConnect from "../config/db.mjs";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import convertDateToDateObject from "../utils/convertDateToDateObject.mjs";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import sendOrderEmailToAdmin from "../utils/sendOrderEmailToAdmin.mjs";
import sendOrderEmailToUser from "../utils/sendOrderEmailToUser.mjs";
import sendAdminBookingConfirmationEmail from "../utils/sendAdminBookingConfirmationEmail.mjs";
import lowUserOnlyMiddleware from "../middlewares/lowUserOnlyMiddleware.js";
import strictUserOnlyMiddleware from "../middlewares/strictUserOnlyMiddleware.mjs";

const router = express.Router();
const db = await dbConnect();
dotenv.config();

const blogsCollection = db.collection("blogs");
const scheduleCollection = db.collection("schedules");
const appointmentCollection = db.collection("appointments");
const courseCollection = db.collection("courses");
const shopCollection = db.collection("shop");
const usersCollection = db.collection("users");
const voucherCollection = db.collection("vouchers");
const orderCollection = db.collection("orders");

let transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_SERVICE_HOST,
  secure: true,
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASS,
  },
});
router.get("/user-orders", lowUserOnlyMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const countOnly = query?.countOnly;
    const userId = req?.user?._id;
    if (countOnly) {
      const count = await orderCollection.countDocuments({ userId });
      return res.status(200).json({
        status: 200,
        count,
        message: "Count of the users order success.",
      });
    } else {
      const orders = await orderCollection.find({ userId }).toArray();
      if (orders) {
        return res.status(200).json({
          status: 200,
          orders,
          message: "Orders of the users found.",
        });
      } else {
        return res.status(404).json({
          status: 404,
          message: "No order found of this user.",
        });
      }
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.put("/update-user-info", lowUserOnlyMiddleware, async (req, res) => {
  try {
    const body = req.body;
    const { currentPassword, newPassword, photoUrl } = body;
    let hashedNewPassword;
    const updatedItems = {};
    if (photoUrl) {
      updatedItems.photoUrl = photoUrl;
    }
    if (newPassword) {
      const user = await usersCollection.findOne(
        { _id: new ObjectId(req?.user?._id) },
        { projection: { _id: 1, password: 1 } }
      );
      if (!user || !(await bcrypt.compare(currentPassword, user?.password))) {
        return res
          .status(401)
          .json({ message: "Invalid credentials", status: 401 });
      } else {
        hashedNewPassword = await bcrypt.hash(newPassword, 10);
        updatedItems.password = hashedNewPassword;
      }
    }
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req?.user?._id) },
      { $set: updatedItems }
    );
    if (result.modifiedCount > 0) {
      return res
        .status(201)
        .json({ message: "User information updated.", status: 200, result });
    } else {
      return res
        .status(400)
        .json({ message: "No information update made.", status: 400 });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.get(
  "/user-enrolled-courses",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const result = await courseCollection
        .find(
          { students: userId },
          { projection: { _id: 1, title: 1, courseId: 1, coverPhotoUrl: 1 } }
        )
        .toArray();
      if (result) {
        return res.status(200).json({
          message: "Courses found.",
          courses: result,
          status: 200,
        });
      } else {
        return res.status(404).json({
          message: "No course found.",
          courses: result,
          status: 404,
        });
      }
    } catch (error) {
      return res.status(500).json({
        message: "Server error",
        status: 500,
        error: error.message,
      });
    }
  }
);

router.get(
  "/user-enrolled-courses/:courseId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const result = await courseCollection.findOne({ courseId });

      if (result) {
        return res.status(200).json({
          message: "Course found.",
          course: result,
          status: 200,
        });
      } else {
        return res.status(404).json({
          message: "No course found.",
          course: result,
          status: 404,
        });
      }
    } catch (error) {
      return res.status(500).json({
        message: "Server error",
        status: 500,
        error: error.message,
      });
    }
  }
);

router.put("/update-progress", lowUserOnlyMiddleware, async (req, res) => {
  try {
    const body = req.body;
    const userId = req.user._id;
    const courseId = body.courseId;
    body.date = new Date();

    // Parsing integer values for module and item
    body.module = parseInt(body.module);
    body.item = parseInt(body.item);

    // Create the progress object for lastSync
    const progress = {
      module: body.module,
      item: body.item,
      percentage: body.percentage || 0, // If no percentage is passed, set it to 0
      date: body.date,
    };

    // Update query to update the lastSync for the specific course
    const result = await usersCollection.updateOne(
      {
        _id: new ObjectId(userId),
        "enrolledCourses.courseId": new ObjectId(courseId),
      },
      {
        $set: {
          "enrolledCourses.$.lastSync": progress, // Update lastSync for the matched course
        },
      }
    );

    // Check if any document was updated
    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: "No changes made.", status: 400 });
    }

    // Send success response
    res
      .status(200)
      .json({ status: 200, message: "Progress updated successfully." });
  } catch (error) {
    // Handle server error
    res.status(500).json({status:500, message: "Internal server error.", error });
  }
});

export default router;
