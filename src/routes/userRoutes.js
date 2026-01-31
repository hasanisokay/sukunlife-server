import express from "express";
import fs from "fs";
import path from "path";

import dbConnect from "../config/db.mjs";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import lowUserOnlyMiddleware from "../middlewares/lowUserOnlyMiddleware.js";
import strictUserOnlyMiddleware from "../middlewares/strictUserOnlyMiddleware.mjs";
import { uploadPublicFile } from "../middlewares/upload.middleware.js";
import { createHLSToken, verifyHLSToken } from "../utils/hlsToken.js";
import { createFileToken, verifyFileToken } from "../utils/fileTokens.js";
import { getFolderFromMime } from "../middlewares/uploadPrivateFile.middleware.js";
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

router.put(
  "/update-progress/:courseId",
  lowUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { courseId } = req.params;
      const {
        action, // 'mark-complete', 'update-video-time', 'quiz-result', 'set-current-item', 'mark-viewed'
        itemId,
        moduleId,
        data, // additional data based on action
      } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Validate course exists
      const course = await courseCollection.findOne({ courseId });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Get user's current progress
      const user = await usersCollection.findOne({
        _id: new ObjectId(userId),
      });

      const progressPath = `courseProgress.${courseId}`;
      let currentProgress = user.courseProgress?.[courseId] || {
        courseId: courseId,
        completedItems: [],
        completedModules: [],
        viewedItems: [], // NEW: Track viewed items
        currentItem: null,
        overallProgress: 0,
        lastUpdated: new Date(),
        startedOn: new Date(),
        quizScores: {},
        videoProgress: {},
      };

      switch (action) {
        case "mark-viewed":
          if (!itemId) {
            return res.status(400).json({ error: "itemId is required" });
          }

          // Track last viewed item
          currentProgress.lastViewedItem = itemId;

          // Add to viewed items if not already
          if (!currentProgress.viewedItems?.includes(itemId)) {
            currentProgress.viewedItems = currentProgress.viewedItems || [];
            currentProgress.viewedItems.push(itemId);
          }

          currentProgress.lastUpdated = new Date();
          break;
        case "mark-complete":
          if (!itemId) {
            return res.status(400).json({ error: "itemId is required" });
          }

          // Add item to completed items if not already
          if (!currentProgress.completedItems.includes(itemId)) {
            currentProgress.completedItems.push(itemId);
          }

          // Also mark as viewed if not already
          if (!currentProgress.viewedItems.includes(itemId)) {
            currentProgress.viewedItems.push(itemId);
          }

          // Check if all items in module are completed
          const module = course.modules.find((m) => m.moduleId === moduleId);
          if (module) {
            const moduleItems = module.items.map((item) => item.itemId);
            const allCompleted = moduleItems.every((itemId) =>
              currentProgress.completedItems.includes(itemId),
            );

            if (
              allCompleted &&
              !currentProgress.completedModules.includes(moduleId)
            ) {
              currentProgress.completedModules.push(moduleId);
            }
          }
          currentProgress.currentItem = itemId;
          break;

        case "update-video-time":
          if (!itemId || !data) {
            return res
              .status(400)
              .json({ error: "itemId and data are required" });
          }

          currentProgress.videoProgress[itemId] = {
            ...currentProgress.videoProgress[itemId],
            currentTime: data.currentTime,
            duration: data.duration,
            percentage: data.percentage,
            lastWatched: new Date(),
          };

          // Mark as viewed when video progress is tracked
          if (!currentProgress.viewedItems.includes(itemId)) {
            currentProgress.viewedItems.push(itemId);
          }
          break;

        case "quiz-result":
          if (!itemId || !data) {
            return res
              .status(400)
              .json({ error: "itemId and data are required" });
          }

          currentProgress.quizScores[itemId] = {
            score: data.score,
            maxScore: data.maxScore,
            passed: data.passed,
            attempts: (currentProgress.quizScores[itemId]?.attempts || 0) + 1,
            lastAttempt: new Date(),
          };

          // Mark as viewed when quiz is attempted
          if (!currentProgress.viewedItems.includes(itemId)) {
            currentProgress.viewedItems.push(itemId);
          }

          // Mark as completed if passed
          if (data.passed && !currentProgress.completedItems.includes(itemId)) {
            currentProgress.completedItems.push(itemId);
          }
          break;

        case "set-current-item":
          if (!itemId) {
            return res.status(400).json({ error: "itemId is required" });
          }
          currentProgress.currentItem = itemId;

          // Also mark as viewed
          if (!currentProgress.viewedItems.includes(itemId)) {
            currentProgress.viewedItems.push(itemId);
          }
          break;

        default:
          return res.status(400).json({ error: "Invalid action" });
      }

      // Calculate overall progress percentage
      const totalItems = course.modules.reduce(
        (total, module) => total + module.items.length,
        0,
      );
      currentProgress.overallProgress =
        totalItems > 0
          ? Math.round(
              (currentProgress.completedItems.length / totalItems) * 100,
            )
          : 0;

      // Check if course is completed
      if (
        currentProgress.overallProgress === 100 &&
        !currentProgress.completedOn
      ) {
        currentProgress.completedOn = new Date();
      }

      currentProgress.lastUpdated = new Date();

      // Update user document
      const updateResult = await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            [progressPath]: currentProgress,
          },
        },
        { upsert: true },
      );

      res.json({
        success: true,
        message: "Progress updated successfully",
        progress: currentProgress,
        updateResult,
      });
    } catch (error) {
      console.error("Error updating progress:", error);
      res.status(500).json({
        error: "Failed to update progress",
        details: error.message,
      });
    }
  },
);

// Also update the course-progress endpoint to include viewedItems
router.get(
  "/course-progress/:courseId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req?.user?._id;
      const { courseId } = req.params;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const course = await courseCollection.findOne({
        courseId,
        students: userId,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const user = await usersCollection.findOne(
        { _id: new ObjectId(userId) },
        { projection: { [`courseProgress.${courseId}`]: 1 } },
      );

      const userProgress = user?.courseProgress?.[courseId] || {
        courseId: courseId,
        completedItems: [],
        completedModules: [],
        viewedItems: [],
        currentItem: null,
        overallProgress: 0,
        startedOn: null,
        lastUpdated: null,
        completedOn: null,
        quizScores: {},
        videoProgress: {},
      };
      const enrichedProgress = {
        ...userProgress,
        course: {
          title: course.title,
          totalModules: course.modules.length,
          totalItems: course.modules.reduce(
            (total, module) => total + module.items.length,
            0,
          ),
          modules: course?.modules?.map((module) => ({
            moduleId: module?.moduleId,
            title: module?.title,
            moduleId: module?.moduleId,
            order: module.order,
            isCompleted: userProgress?.completedModules.includes(
              module?.moduleId,
            ),
            isViewed: userProgress?.completedModules.includes(module?.moduleId),
            items: module.items.map((item) => ({
              // common fields
              itemId: item.itemId,
              type: item.type,
              status: item.status,
              order: item.order,
              title: item.title,
              ...(item?.description && { description: item?.description }),
              ...(item?.duration && { duration: item?.duration }),
              ...(item?.url && { url: item?.url }),

              ...(item.type === "textInstruction" && {
                content: item?.content,
              }),
              ...(item.type === "quiz" && {
                question: item?.question,
                options: item?.options,
                answer: item?.answer,
              }),
              ...(userProgress && {
                isCompleted:
                  userProgress?.completedItems?.includes(item?.itemId) || false,
                isViewed:
                  userProgress.viewedItems?.includes(item?.itemId) || false,
                videoProgress:
                  userProgress.videoProgress?.[item?.itemId] ?? null,
                quizScore: userProgress?.quizScores?.[item?.itemId] ?? null,
              }),
            })),
          })),
        },
      };

      res.status(200).json({
        success: true,
        progress: enrichedProgress,
      });
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({
        error: "Failed to fetch progress",
        details: error.message,
      });
    }
  },
);
router.get("/all-progress", strictUserOnlyMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { courseProgress: 1 } },
    );

    const progress = user?.courseProgress || {};

    res.json({
      success: true,
      progress: progress,
    });
  } catch (error) {
    console.error("Error fetching all progress:", error);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});
router.delete(
  "/reset-progress/:courseId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { courseId } = req.params;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $unset: { [`courseProgress.${courseId}`]: "" } },
      );

      res.json({
        success: true,
        message: "Progress reset successfully",
        result,
      });
    } catch (error) {
      console.error("Error resetting progress:", error);
      res.status(500).json({ error: "Failed to reset progress" });
    }
  },
);

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
  "/course/stream-url/:courseId/:videoId",
  // strictUserOnlyMiddleware,
  async (req, res) => {
    // todo:uncomment middleware and userId
    const { courseId, videoId } = req.params;
    // const userId = req.user._id.toString();
    const userId = req?.user?._id?.toString() || "69784bb7843705c35aa436e9";
    // testing currently. no auth needed
    const course = await courseCollection.findOne({ courseId });
    if (!course) return res.status(404).json({ error: "Course not found" });

    let videoItem = null;
    for (const module of course.modules) {
      for (const item of module.items) {
        if (item.type === "video" && item.url.filename === videoId) {
          videoItem = item;
          break;
        }
      }
      if (videoItem) break;
    }

    if (!videoItem) return res.status(404).json({ error: "Video not found" });

    // public video
    if (videoItem.status === "public") {
      return res.json({
        url: `${process.env.SERVER_URL}/api/user/course/stream/${courseId}/${videoId}/master.m3u8`,
      });
    }

    // private video
    const token = createHLSToken(userId, courseId, videoId);

    res.json({
      url: `${process.env.SERVER_URL}/api/user/course/stream/${courseId}/${videoId}/master.m3u8?token=${token}`,
    });
  },
);

router.get(
  "/modules/:courseId/:moduleId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const { courseId, moduleId } = req.params;

      const course = await courseCollection.findOne(
        { courseId },
        {
          projection: {
            title: 1,
            courseId: 1,
            modules: 1,
          },
        },
      );

      if (!course) {
        return res.status(404).json({
          message: "No course found",
          status: 404,
        });
      }

      // Try to find the requested module
      const matchedModule = course.modules?.find(
        (m) => m.moduleId === moduleId,
      );

      return res.status(200).json({
        message: "Course Found",
        status: 200,
        course: {
          ...course,
          modules: matchedModule ? [matchedModule] : course.modules,
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: "Server error",
        status: 500,
        error: error.message,
      });
    }
  },
);

router.get("/course/stream/:courseId/:videoId/*", async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const file = req.params[0];
    const { token } = req.query;

    console.log(`Streaming request: ${file}`);

    const course = await courseCollection.findOne({ courseId });
    if (!course) {
      console.error("Course not found:", courseId);
      return res.status(404).end("Course not found");
    }

    let videoItem = null;
    for (const module of course.modules) {
      for (const item of module.items) {
        if (item.type === "video" && item.url.filename === videoId) {
          videoItem = item;
          break;
        }
      }
      if (videoItem) break;
    }

    if (!videoItem) {
      console.error("Video not found:", videoId);
      return res.status(404).end("Video not found");
    }

    const isPublic = videoItem.status === "public";

    if (!isPublic) {
      if (!token) {
        console.error("Missing token for private video");
        return res.status(403).end("Missing token");
      }

      try {
        const decoded = Buffer.from(token, "base64url").toString();
        const userId = decoded.split("|")[0];

        if (!verifyHLSToken(token, userId, courseId, videoId)) {
          console.error("Invalid token");
          return res.status(403).end("Invalid token");
        }
      } catch (err) {
        console.error("Token verification error:", err);
        return res.status(403).end("Invalid token");
      }
    }

    const basePath = path.join("/data/uploads/private/videos", videoId);
    const filePath = path.join(basePath, file);

    // Path traversal protection
    if (!filePath.startsWith(basePath)) {
      console.error("Path traversal attempt:", filePath);
      return res.status(403).end("Invalid path");
    }

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return res.status(404).end("File not found");
    }

    // Handle playlists (.m3u8)
    if (file.endsWith(".m3u8")) {
      let playlist = fs.readFileSync(filePath, "utf8");

      // Debug log
      if (file === "master.m3u8") {
        console.log("✅ Serving master playlist successfully");
      }

      if (!isPublic && token) {
        // Rewrite .ts segment URLs
        playlist = playlist.replace(/(seg_\d+\.ts)/g, `$1?token=${token}`);

        // Rewrite variant playlist URLs (720p/index.m3u8, 1080p/index.m3u8)
        playlist = playlist.replace(
          /(720p\/index\.m3u8|1080p\/index\.m3u8)/g,
          `$1?token=${token}`,
        );

        // Rewrite encryption key URI if present
        playlist = playlist.replace(
          /(URI=")([^"]+)(")/g,
          (match, p1, uri, p3) => `${p1}${uri}?token=${token}${p3}`,
        );
      }

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.send(playlist);
    }

    // Handle .ts segments
    if (file.endsWith(".ts")) {
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Cache-Control", "no-store");
      return fs.createReadStream(filePath).pipe(res);
    }

    // Other files
    console.error("Unsupported file type:", file);
    res.status(404).end("Unsupported file type");
  } catch (err) {
    console.error("❌ Streaming error:", err);
    res.status(500).end("Server error");
  }
});
router.get("/course/key/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const { token } = req.query;

    if (!token) return res.status(403).end("Missing token");

    const decoded = Buffer.from(token, "base64url").toString();
    const [userId, courseId, vid] = decoded.split("|");

    if (!verifyHLSToken(token, userId, courseId, videoId)) {
      return res.status(403).end("Invalid token");
    }

    const keyPath = path.join(
      "/data/uploads/private/videos",
      videoId,
      "key.key",
    );

    if (!fs.existsSync(keyPath)) {
      return res.status(404).end("Key not found");
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(keyPath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).end("Server error");
  }
});

router.post("/ping-stream", strictUserOnlyMiddleware, async (req, res) => {
  await streamsCollection.updateOne(
    { userId: req.user._id },
    { $set: { lastPing: new Date() } },
    { upsert: true },
  );

  res.json({ ok: true });
});

router.post(
  "/course/file/token",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const { courseId, filename } = req.body;
      const userId = req.user.id;
      const course = await courseCollection.findOne({
        courseId,
        students: req?.user?._id,
      });
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      let fileItem = null;

      for (const module of course.modules) {
        for (const item of module.items) {
          if (item.type !== "video" && item.url?.filename === filename) {
            fileItem = item;
            break;
          }
        }
        if (fileItem) break;
      }

      if (!fileItem) {
        return res.status(404).json({ error: "File not found" });
      }

      if (fileItem.status === "public") {
        return res.json({ token: null });
      }

      const token = createFileToken(userId, courseId, filename);

      res.json({
        token,
        expiresIn: 600,
      });
    } catch (err) {
      console.error("❌ File token error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.get("/course/file/:courseId/:filename", async (req, res) => {
  try {
    const { courseId, filename } = req.params;
    const { token } = req.query;

    const course = await courseCollection.findOne({ courseId });
    if (!course) {
      return res.status(404).end("Course not found");
    }

    let fileItem = null;

    for (const module of course?.modules) {
      for (const item of module?.items) {
        if (item.type !== "video" && item?.url?.filename === filename) {
          fileItem = item;
          break;
        }
      }
      if (fileItem) break;
    }

    if (!fileItem) {
      return res.status(404).end("File not found");
    }

    const isPublic = fileItem.status === "public";

    // Token check
    if (!isPublic) {
      if (!token) {
        return res.status(403).end("Missing token");
      }

      try {
        const decoded = Buffer.from(token, "base64url").toString();
        const userId = decoded.split("|")[0];

        if (!verifyFileToken(token, userId, courseId, filename)) {
          return res.status(403).end("Invalid token");
        }
      } catch {
        return res.status(403).end("Invalid token");
      }
    }
    let filePathFromDb = fileItem?.url?.path;
    if (!filePathFromDb) {
      filePathFromDb = getFolderFromMime(fileItem?.url?.mime);
    }
    const baseDir = path.join("/data/uploads/private", filePathFromDb);

    const filePath = path.join(baseDir, filename);

    // 🛡️ Path traversal protection
    if (!filePath.startsWith(baseDir)) {
      return res.status(403).end("Invalid path");
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).end("File not found");
    }

    // 📦 Headers
    res.setHeader("Content-Type", fileItem.mime || "application/octet-stream");
res.setHeader(
  "Content-Disposition",
  `inline; filename="${filename}"`
);


    res.setHeader("Cache-Control", "no-store");

    // 🚀 Stream
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("❌ File serve error:", err);
    res.status(500).end("Server error");
  }
});

export default router;
