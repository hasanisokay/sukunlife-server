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
import {
  getContentDisposition,
  getMimeTypeForHeader,
} from "../utils/getFileType.js";
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

// ============================================
// CORS Preflight Handlers
// ============================================
router.options("/course/stream/:courseId/:videoId/*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
});

router.options("/course/key/:videoId", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
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
  "/update-progress/:courseId/:moduleId/:itemId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req.user?._id;
      const { courseId, moduleId, itemId } = req.params;
      const { action, data } = req.body; // data.progress, data.selected, etc

      if (!userId || !courseId || !moduleId || !itemId || !action) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const course = await courseCollection.findOne({
        courseId,
        students: userId,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const user = await usersCollection.findOne({
        _id: new ObjectId(userId),
      });

      const progressPath = `courseProgress.${courseId}`;

      // ---------- INIT PROGRESS IF NOT EXISTS ----------
      let currentProgress = user?.courseProgress?.[courseId];

      if (!currentProgress) {
        const firstModule = course.modules[0];
        const firstItem = firstModule?.items[0];

        currentProgress = {
          courseId,
          viewed: [], // [{ moduleId, items: [{ itemId, progress }] }]
          currentModule: firstModule?.moduleId || null,
          currentItem: firstItem?.itemId || null,
          currentItemProgress: 0,
          overallProgress: 0,
          startedOn: new Date(),
          lastUpdated: new Date(),
          completedOn: null,
          quizScores: {}, // { itemId: { selected, correct, answeredOn } }
        };
      }

      // ---------- ACTION HANDLING ----------
      if (action === "VIDEO_PROGRESS") {
        const progressValue = Math.min(100, Math.max(0, data?.progress || 0));

        const moduleIndex = currentProgress.viewed.findIndex(
          (m) => m.moduleId === moduleId,
        );

        if (moduleIndex === -1) {
          currentProgress.viewed.push({
            moduleId,
            items: [{ itemId, progress: progressValue }],
          });
        } else {
          const itemIndex = currentProgress.viewed[moduleIndex].items.findIndex(
            (i) => i.itemId === itemId,
          );

          if (itemIndex === -1) {
            currentProgress.viewed[moduleIndex].items.push({
              itemId,
              progress: progressValue,
            });
          } else {
            const oldProgress =
              currentProgress.viewed[moduleIndex].items[itemIndex].progress ||
              0;

            currentProgress.viewed[moduleIndex].items[itemIndex].progress =
              Math.max(oldProgress, progressValue); // forward only
          }
        }

        currentProgress.currentItemProgress = progressValue;
      }

      // ---------- MARK COMPLETE ----------
      if (action === "MARK_COMPLETE") {
        const moduleIndex = currentProgress.viewed.findIndex(
          (m) => m.moduleId === moduleId,
        );

        if (moduleIndex === -1) {
          currentProgress.viewed.push({
            moduleId,
            items: [{ itemId, progress: 100 }],
          });
        } else {
          const itemIndex = currentProgress.viewed[moduleIndex].items.findIndex(
            (i) => i.itemId === itemId,
          );

          if (itemIndex === -1) {
            currentProgress.viewed[moduleIndex].items.push({
              itemId,
              progress: 100,
            });
          } else {
            currentProgress.viewed[moduleIndex].items[itemIndex].progress = 100;
          }
        }

        currentProgress.currentItemProgress = 100;
      }

      // ---------- QUIZ SUBMIT ----------
      if (action === "QUIZ_SUBMIT") {
        // ensure module object exists
        if (!currentProgress.quizScores[moduleId]) {
          currentProgress.quizScores[moduleId] = {};
        }

        currentProgress.quizScores[moduleId][itemId] = {
          selected: data?.selected,
          correct: data?.correct,
          answeredOn: new Date(),
        };

        // mark quiz as complete if correct
        if (data?.correct) {
          const moduleIndex = currentProgress.viewed.findIndex(
            (m) => m.moduleId === moduleId,
          );

          if (moduleIndex === -1) {
            currentProgress.viewed.push({
              moduleId,
              items: [{ itemId, progress: 100 }],
            });
          } else {
            const itemIndex = currentProgress.viewed[
              moduleIndex
            ].items.findIndex((i) => i.itemId === itemId);

            if (itemIndex === -1) {
              currentProgress.viewed[moduleIndex].items.push({
                itemId,
                progress: 100,
              });
            } else {
              currentProgress.viewed[moduleIndex].items[itemIndex].progress =
                100;
            }
          }
        }
      }

      // ---------- SET CURRENT ITEM ----------
      currentProgress.currentModule = moduleId;
      currentProgress.currentItem = itemId;

      // ---------- CALCULATE OVERALL PROGRESS ----------
      const totalItems = course.modules.reduce(
        (sum, m) => sum + m.items.length,
        0,
      );

      const completedCount = currentProgress.viewed.reduce(
        (sum, m) => sum + m.items.filter((i) => i.progress >= 100).length,
        0,
      );

      currentProgress.overallProgress =
        totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

      // ---------- MARK COURSE COMPLETED ----------
      if (
        currentProgress.overallProgress === 100 &&
        !currentProgress.completedOn
      ) {
        currentProgress.completedOn = new Date();
      }

      currentProgress.lastUpdated = new Date();

      // ---------- SAVE ----------
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

router.get(
  "/course-progress/:courseId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const userId = req.user?._id;
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
        courseId,
        viewed: [],
        currentModule: null,
        currentItem: null,
        currentItemProgress: 0,
        overallProgress: 0,
        startedOn: null,
        lastUpdated: null,
        completedOn: null,
        quizScores: {},
      };

      // helper maps
      const viewedMap = {}; // moduleId -> { itemId -> progress }
      for (const m of userProgress.viewed || []) {
        viewedMap[m.moduleId] = {};
        for (const i of m.items || []) {
          viewedMap[m.moduleId][i.itemId] = i.progress;
        }
      }

      const enrichedProgress = {
        ...userProgress,
        course: {
          title: course.title,
          totalModules: course.modules.length,
          totalItems: course.modules.reduce(
            (total, module) => total + module.items.length,
            0,
          ),
          modules: course.modules.map((module) => {
            const moduleViewedItems = viewedMap[module.moduleId] || {};
            const moduleCompleted =
              module.items.length > 0 &&
              module.items.every(
                (item) => (moduleViewedItems[item.itemId] || 0) >= 100,
              );

            return {
              moduleId: module.moduleId,
              title: module.title,
              order: module.order,
              isCompleted: moduleCompleted,
              isViewed: Object.keys(moduleViewedItems).length > 0,

              items: module.items.map((item) => {
                const itemProgress = moduleViewedItems[item.itemId] ?? null;

                const quizScore =
                  userProgress.quizScores?.[module.moduleId]?.[item.itemId] ??
                  null;

                return {
                  // base fields
                  itemId: item.itemId,
                  type: item.type,
                  status: item.status,
                  order: item.order,
                  title: item.title,
                  ...(item.description && { description: item.description }),
                  ...(item.duration && { duration: item.duration }),
                  ...(item.url && { url: item.url }),

                  ...(item.type === "textInstruction" && {
                    content: item.content,
                  }),

                  ...(item.type === "quiz" && {
                    question: item.question,
                    options: item.options,
                    answer: item.answer,
                  }),

                  // progress fields
                  isCompleted: itemProgress >= 100,
                  isViewed: itemProgress !== null,
                  videoProgress: item.type === "video" ? itemProgress : null,
                  quizScore: quizScore,
                };
              }),
            };
          }),
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
router.get(
  "/check-if-enrolled/:courseId",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const userId = req.user?._id;

      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", success: false, enrolled: false });
      }

      const course = await courseCollection.findOne(
        {
          courseId,
          students: userId,
        },
        {
          projection: { _id: 1 },
        },
      );

      if (!course) {
        return res.status(404).json({
          success: false,
          enrolled: false,
          error: "Enrollment not found",
        });
      }

      // Fetch only the progress for this course
      const user = await usersCollection.findOne(
        { _id: new ObjectId(userId) },
        { projection: { [`courseProgress.${courseId}`]: 1 } },
      );

      return res.status(200).json({
        success: true,
        enrolled: true,
        progress: user?.courseProgress?.[courseId] ?? null,
      });
    } catch (error) {
      console.error("check-if-enrolled error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

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
  strictUserOnlyMiddleware,
  async (req, res) => {
    const { courseId, videoId } = req.params;
    const userId = req?.user?._id?.toString();
    const course = await courseCollection.findOne({
      courseId,
      students: req?.user?._id,
    });

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

router.get("/course/stream/:courseId/:videoId/*", async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const file = req.params[0] || "master.m3u8";
    const { token } = req.query;

    // ⭐ ADD THIS DEBUG LOG
    console.log(
      `📹 Stream request: courseId=${courseId}, videoId=${videoId}, file=${file}, token=${token ? "present ✅" : "MISSING ❌"}`,
    );
    console.log(`📹 Full URL: ${req.url}`);
    console.log(`📹 Query params:`, req.query);
    // Verify course exists
    const course = await courseCollection.findOne({ courseId });
    if (!course) {
      console.error("❌ Course not found:", courseId);
      return res.status(404).end("Course not found");
    }

    // Find video item in course
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
      console.error("❌ Video not found:", videoId);
      return res.status(404).end("Video not found");
    }

    const isPublic = videoItem.status === "public";

    // Token verification for private videos
    if (!isPublic) {
      if (!token) {
        console.error("❌ Missing token for private video");
        return res.status(403).end("Missing token");
      }

      try {
        const decoded = Buffer.from(token, "base64url").toString();
        const parts = decoded.split("|");

        if (parts.length !== 4) {
          console.error("❌ Invalid token format");
          return res.status(403).end("Invalid token");
        }

        const userId = parts[0];

        // Verify token signature
        if (!verifyHLSToken(token, userId, courseId, videoId)) {
          console.error("❌ Token verification failed");
          return res.status(403).end("Invalid token");
        }

        // Verify user still has access to the course
        const userHasAccess = await courseCollection.findOne({
          courseId,
          students: userId,
        });

        if (!userHasAccess) {
          console.error(
            `❌ User ${userId} does not have access to course ${courseId}`,
          );
          return res.status(403).end("Access denied");
        }

        console.log(`✅ Token verified for user ${userId}`);
      } catch (err) {
        console.error("❌ Token verification error:", err);
        return res.status(403).end("Invalid token");
      }
    }

    // Construct file path
    const basePath = path.join("/data/uploads/private/videos", videoId);
    const filePath = path.join(basePath, file);

    // Enhanced path traversal protection
    const normalizedFilePath = path.normalize(filePath);
    const normalizedBasePath = path.normalize(basePath);

    if (
      !normalizedFilePath.startsWith(normalizedBasePath + path.sep) &&
      normalizedFilePath !== normalizedBasePath
    ) {
      console.error("❌ Path traversal attempt:", filePath);
      return res.status(403).end("Invalid path");
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return res.status(404).end("File not found");
    }

    // Handle playlists (.m3u8)
    if (file.endsWith(".m3u8")) {
      let playlist = fs.readFileSync(filePath, "utf8");

      console.log(`✅ Serving playlist: ${file}`);

      if (!isPublic && token) {
        // For master playlist, rewrite variant playlist URLs
        if (file === "master.m3u8") {
          // Rewrite variant playlists
          playlist = playlist.replace(
            /^(720p\/index\.m3u8|1080p\/index\.m3u8)$/gm,
            `$1?token=${token}`,
          );
        } else {
          // For variant playlists (720p/index.m3u8, 1080p/index.m3u8)
          // Rewrite .ts segment URLs
          playlist = playlist.replace(/^(seg_\d+\.ts)$/gm, `$1?token=${token}`);
        }

        // ⭐ CRITICAL FIX: Rewrite encryption key URI
        // This regex handles both with and without quotes around the URI
        // ⭐ FIXED: Rewrite encryption key URI (with IV parameter support)
        playlist = playlist.replace(
          /#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"(,IV=[^,\n]+)?/g,
          (match, uri, ivPart) => {
            console.log("🔑 Found encryption key line");
            console.log("🔑 URI:", uri);
            console.log("🔑 IV:", ivPart);

            // Check if URI already has token
            if (uri.includes("token=")) {
              console.log("⚠️ Token already present");
              return match;
            }

            // Add token to URI
            const separator = uri.includes("?") ? "&" : "?";
            const newUri = `${uri}${separator}token=${token}`;
            const result = `#EXT-X-KEY:METHOD=AES-128,URI="${newUri}"${ivPart || ""}`;

            console.log("✨ Rewritten to:", result);
            return result;
          },
        );
      }

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.send(playlist);
    }

    // Handle .ts segments
    if (file.endsWith(".ts")) {
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return fs.createReadStream(filePath).pipe(res);
    }

    // Other files
    console.error("❌ Unsupported file type:", file);
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

    console.log(`🔑 Key request for videoId: ${videoId}`);

    // Check if token is provided
    if (!token) {
      console.error("❌ Missing token for key request");
      return res.status(403).end("Missing token");
    }

    // Decode and verify token
    let userId, courseId, tokenVideoId;
    try {
      const decoded = Buffer.from(token, "base64url").toString();
      const parts = decoded.split("|");

      if (parts.length !== 4) {
        console.error("❌ Invalid token format");
        return res.status(403).end("Invalid token format");
      }

      [userId, courseId, tokenVideoId] = parts;

      console.log(
        `Token decoded: userId=${userId}, courseId=${courseId}, videoId=${tokenVideoId}`,
      );

      // Verify the videoId from URL matches the one in the token
      if (tokenVideoId !== videoId) {
        console.error(
          `❌ VideoId mismatch: URL=${videoId}, Token=${tokenVideoId}`,
        );
        return res.status(403).end("Invalid token");
      }

      // Verify the token signature
      if (!verifyHLSToken(token, userId, courseId, videoId)) {
        console.error("❌ Token verification failed");
        return res.status(403).end("Invalid token");
      }
    } catch (err) {
      console.error("❌ Token decode error:", err);
      return res.status(403).end("Invalid token format");
    }

    // Verify user still has access to the course
    const course = await courseCollection.findOne({
      courseId,
      students: userId, // Adjust based on how you store student IDs
    });

    if (!course) {
      console.error(
        `❌ User ${userId} does not have access to course ${courseId}`,
      );
      return res.status(403).end("Access denied");
    }

    // Check if video exists in course
    let videoExists = false;
    for (const module of course.modules) {
      for (const item of module.items) {
        if (item.type === "video" && item.url.filename === videoId) {
          videoExists = true;
          break;
        }
      }
      if (videoExists) break;
    }

    if (!videoExists) {
      console.error(`❌ Video ${videoId} not found in course ${courseId}`);
      return res.status(404).end("Video not found in course");
    }

    // Construct path to encryption key
    const keyPath = path.join(
      "/data/uploads/private/videos",
      videoId,
      "key.key",
    );

    // Verify key file exists
    if (!fs.existsSync(keyPath)) {
      console.error(`❌ Key file not found: ${keyPath}`);
      return res.status(404).end("Key not found");
    }

    console.log(`✅ Serving encryption key for ${videoId} to user ${userId}`);

    // Set response headers
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Stream the key file
    fs.createReadStream(keyPath).pipe(res);
  } catch (err) {
    console.error("❌ Key endpoint error:", err);
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
// getting course file token
router.post(
  "/course/file/token",
  strictUserOnlyMiddleware,
  async (req, res) => {
    try {
      const { courseId, filename } = req.body;
      const userId = req?.user?._id?.toString();
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
    const baseDir = path.join("/data/uploads/private");

    const filePath = path.join(baseDir, filePathFromDb);

    if (!filePath.startsWith(baseDir)) {
      return res.status(403).end("Invalid path");
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).end("File not found");
    }
    const mimeType = getMimeTypeForHeader(filename, fileItem?.url?.mime);
    const contentDisposition = getContentDisposition(filename, mimeType);

    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      console.log("Requested path is a directory, not a file", filePath);
      return res.status(400).end("Requested path is a directory, not a file");
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", contentDisposition);

    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      res.setHeader("Content-Type", `${mimeType}; charset=utf-8`);
    }

    res.setHeader("Cache-Control", "no-store");

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("❌ File serve error:", err);
    res.status(500).end("Server error");
  }
});

export default router;
