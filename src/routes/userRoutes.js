import express from "express";
import dbConnect from "../config/db.mjs";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import lowUserOnlyMiddleware from "../middlewares/lowUserOnlyMiddleware.js";
import strictUserOnlyMiddleware from "../middlewares/strictUserOnlyMiddleware.mjs";
import { uploadPublicFile } from "../middlewares/upload.middleware.js";

import fs from "fs";
import path from "path";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";

const router = express.Router();
const db = await dbConnect();
dotenv.config();

const appointmentCollection = db?.collection("appointments");
const courseCollection = db?.collection("courses");
const streamsCollection = db?.collection("streams");
const shopCollection = db?.collection("shop");
const usersCollection = db?.collection("users");
const orderCollection = db?.collection("orders");
const appointmentReviewCollection = db?.collection("appointment-reviews");

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
        { projection: { _id: 1, password: 1 } },
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
      { $set: updatedItems },
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
          { projection: { _id: 1, title: 1, courseId: 1, coverPhotoUrl: 1 } },
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
  },
);

router.get(
  "/user-enrolled-courses/:courseId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const courseInfo = await courseCollection.findOne(
        {
          courseId,
          students: req?.user?._id,
        },
        { projection: { _id: 1 } },
      );
      if (!courseInfo) {
        return res.status(404).json({
          message: "No course found.",
          status: 404,
        });
      }
      const isEnrolled = await usersCollection.findOne(
        {
          _id: new ObjectId(req.user._id),
          enrolledCourses: courseInfo._id.toString(),
        },
        { projection: { _id: 1 } },
      );

      if (!isEnrolled) {
        return res.status(404).json({
          message: "No course found.",
          status: 404,
        });
      }
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
  },
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
      },
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
    res
      .status(500)
      .json({ status: 500, message: "Internal server error.", error });
  }
});
router.get("/user-orders", strictUserOnlyMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const countOnly = query?.countOnly;
    const appointmentsOnly = query?.appointmentsOnly;
    const userId = req?.user?._id;
    if (appointmentsOnly === "true") {
      const appointments = await appointmentCollection
        .find({ "loggedInUser._id": userId })
        .toArray();

      if (appointments) {
        return res.status(200).json({
          status: 200,
          appointments,
          message: "Appointments of the users found.",
        });
      } else {
        return res.status(404).json({
          status: 404,
          message: "No appointment found of this user.",
        });
      }
    } else if (countOnly === "true") {
      const orderCount = await orderCollection.countDocuments({ userId });
      const appointmentCount = await appointmentCollection.countDocuments({
        "loggedInUser._id": userId,
      });
      return res.status(200).json({
        status: 200,
        orderCount,
        appointmentCount,
        message: "Count of the user order success.",
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

router.post(
  "/appointment-review",
  strictUserOnlyMiddleware,
  async (req, res) => {
    const { rating, appointmentId, userId, name, comment } = req.body;

    if (!userId || !name || !comment || !rating || !appointmentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    try {
      // Prepare the review object
      const review = {
        appointmentId,
        userId,
        name,
        comment,
        rating: parseInt(rating),
        date: new Date(),
      };
      await appointmentCollection.updateOne(
        { _id: new ObjectId(appointmentId) },
        { $set: { reviewed: true } },
      );

      const result = await appointmentReviewCollection.insertOne(review);

      res.status(200).json({
        success: true,
        message: "Review submitted successfully",
        status: 200,
        result,
      });
    } catch (error) {
      console.log("Error submitting review:", error);
      res.status(500).json({
        status: 500,
        success: false,
        message: "Failed to submit review",
      });
    }
  },
);
router.post("/submit-review", async (req, res) => {
  const { productId, orderId, type, userId, name, comment, rating } = req.body;

  if (
    !productId ||
    !orderId ||
    !type ||
    !userId ||
    !name ||
    !comment ||
    !rating
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  try {
    // Update the orderCollection to mark the product as reviewed
    const orderUpdateResult = await orderCollection.updateOne(
      { _id: new ObjectId(orderId), "cartItems._id": productId },
      { $set: { "cartItems.$.reviewed": true } },
    );

    if (orderUpdateResult.modifiedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order or product not found" });
    }

    // Prepare the review object
    const review = {
      userId,
      name,
      comment,
      rating: parseInt(rating),
      date: new Date(),
    };

    // Update the shopCollection or courseCollection based on the type
    if (type === "product") {
      const shopUpdateResult = await shopCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $push: { reviews: review } },
      );

      if (shopUpdateResult.modifiedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found in shopCollection",
        });
      }
    } else if (type === "course") {
      const courseUpdateResult = await courseCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $push: { reviews: review } },
      );

      if (courseUpdateResult.modifiedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Course not found in courseCollection",
        });
      }
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid type", status: 400 });
    }
    res.status(200).json({
      success: true,
      message: "Review submitted successfully",
      status: 200,
    });
  } catch (error) {
    console.log("Error submitting review:", error);
    res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to submit review",
    });
  }
});

router.post(
  "/upload/file",
  strictUserOnlyMiddleware,
  uploadPublicFile.single("file"),
  (req, res) => {
    const type = req.file._fileType;

    const limits = {
      image: 50 * 1024 * 1024, //50mb for img
      audio: 200 * 1024 * 1024, //200 mb for audio
      video: 1000 * 1024 * 1024, //1000mb for video
      pdf: 50 * 1024 * 1024, //50mb for pdf
    };

    if (req.file.size > limits[type]) {
      return res.status(400).json({
        error: `${type} files must be smaller than ${limits[type] / 1024 / 1024}MB`,
      });
    }

    let folder = "docs";
    if (type === "image") folder = "images";
    if (type === "audio") folder = "audio";
    if (type === "video") folder = "video";
    if (type === "pdf") folder = "docs";

    const url = `https://cdn.sukunlife.com/${folder}/${req.file.filename}`;

    res.json({ url, type });
  },
);

router.get(
  "/course/file/:courseId/:filename",
  // strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req?.user?._id.toString();
      const { courseId, filename } = req.params;

      const courseInfo = await courseCollection.findOne({
        courseId,
        // students: req?.user?._id,
      });

      if (!courseInfo) {
        return res.status(403).json({ message: "Access denied" });
      }

      // const isEnrolled = await usersCollection.findOne(
      //   {
      //     _id: new ObjectId(userId),
      //     enrolledCourses: courseInfo._id.toString(),
      //   },
      //   { projection: { _id: 1 } },
      // );

      // if (!isEnrolled) {
      //   return res.status(403).json({ message: "Access denied" });
      // }

      // 2. Find file inside modules
      let file = null;

      for (const module of courseInfo.modules) {
        for (const item of module.items) {
          if (
            item.url?.filename === filename &&
            item.status === "private" &&
            (item.type === "video" || item.type === "file")
          ) {
            file = item;
            break;
          }
        }
        if (file) break;
      }

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // const activeStream = await streamsCollection.findOne({
      //   userId: req.user._id,
      // });

      // if (activeStream) {
      //   const diff = Date.now() - new Date(activeStream.lastPing).getTime();

      //   if (diff < 60000 && activeStream.filename !== filename) {
      //     return res.status(403).json({
      //       error: "Another active stream detected",
      //     });
      //   }
      // }

      // register / refresh stream AFTER check
      // await streamsCollection.updateOne(
      //   { userId: req.user._id },
      //   {
      //     $set: {
      //       userId: req.user._id,
      //       courseId,
      //       filename,
      //       startedAt: new Date(),
      //       lastPing: new Date(),
      //     },
      //   },
      //   { upsert: true },
      // );

      // 3. Decide folder by mime/type
      let folder = "others";
      if (file.type === "video") folder = "videos";
      else if (file.url.mime?.startsWith("image")) folder = "images";
      else if (file.url.mime === "application/pdf") folder = "pdfs";
      else if (file.url.mime?.startsWith("audio")) folder = "audio";
      const filePath = path.join(
        "/data/uploads/private",
        folder,
        file.url.filename,
      );

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File missing on server" });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      res.setHeader("Content-Type", file.url.mime);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // 4. Video streaming
      if (range && file.type === "video") {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
        });

        stream.pipe(res);
      } else {
        res.setHeader("Content-Length", fileSize);
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/ping-stream", strictUserOnlyMiddleware, async (req, res) => {
  await streamsCollection.updateOne(
    { userId: req.user._id },
    { $set: { lastPing: new Date() } },
    { upsert: true },
  );

  res.json({ ok: true });
});

export default router;
