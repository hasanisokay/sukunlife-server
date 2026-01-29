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

// router.get("/course/stream/:courseId/:videoId/*", async (req, res) => {
//   try {
//     const { courseId, videoId } = req.params;
//     const file = req.params[0]; // master.m3u8, 0/index.m3u8, 0/seg_001.ts
//     const { token } = req.query;

//     const course = await courseCollection.findOne({ courseId });
//     if (!course) return res.status(404).end("Course not found");

//     // 🔍 find video item in course
//     let videoItem = null;

//     for (const module of course.modules) {
//       for (const item of module.items) {
//         if (item.type === "video" && item.url.filename === videoId) {
//           videoItem = item;
//           break;
//         }
//       }
//       if (videoItem) break;
//     }

//     if (!videoItem) return res.status(404).end("Video not found");

//     const isPublic = videoItem.status === "public";

//     // 🔐 private video → verify token
//     if (!isPublic) {
//       if (!token) return res.status(403).end("Missing token");

//       const decoded = Buffer.from(token, "base64url").toString();
//       const userId = decoded.split("|")[0];

//       if (!verifyHLSToken(token, userId, courseId, videoId)) {
//         return res.status(403).end("Invalid token");
//       }
//     }

//     const basePath = path.join("/data/uploads/private/videos", videoId);
//     const filePath = path.join(basePath, file);

//     // path traversal protection
//     if (!filePath.startsWith(basePath)) {
//       return res.status(403).end("Invalid path");
//     }

//     if (!fs.existsSync(filePath)) {
//       return res.status(404).end("Not found");
//     }

//     // 📜 playlist → inject token for private
//     if (file.endsWith(".m3u8")) {
//       let playlist = fs.readFileSync(filePath, "utf8");

//       if (!isPublic) {
//         // rewrite ts segments
//         playlist = playlist.replace(/(seg_[^"\n]+\.ts)/g, `$1?token=${token}`);

//         // rewrite variant playlists (0/index.m3u8 etc)
//         playlist = playlist.replace(/(\d+\/index\.m3u8)/g, `$1?token=${token}`);

//         // rewrite key URL
//         playlist = playlist.replace(
//           /(\/course\/key\/[^\n"]+)/g,
//           `$1?token=${token}`,
//         );
//       }

//       res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
//       res.setHeader("Cache-Control", "no-store");
//       return res.send(playlist);
//     }

//     // TS segment
//     res.setHeader("Content-Type", "video/mp2t");
//     res.setHeader("Cache-Control", "no-store");
//     fs.createReadStream(filePath).pipe(res);
//   } catch (err) {
//     console.error(err);
//     res.status(500).end("Server error");
//   }
// });

router.get("/course/stream/:courseId/:videoId/*", async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    const requestedFile = req.params[0];
    const { token } = req.query;

    console.log(`📺 Streaming request - Course: ${courseId}, Video: ${videoId}, File: ${requestedFile}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");

    // Handle preflight
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // Validate course exists
    const course = await courseCollection.findOne({ courseId });
    if (!course) {
      console.error("❌ Course not found:", courseId);
      return res.status(404).send("Course not found");
    }

    // Find video in course structure
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
      console.error("❌ Video not found in course:", videoId);
      return res.status(404).send("Video not found");
    }

    const isPublic = videoItem.status === "public";

    // Token validation for private videos
    if (!isPublic) {
      if (!token) {
        console.error("🔒 Missing token for private video");
        return res.status(403).send("Authentication required");
      }

      try {
        const decoded = Buffer.from(token, "base64url").toString();
        const userId = decoded.split("|")[0];

        if (!verifyHLSToken(token, userId, courseId, videoId)) {
          console.error("❌ Invalid token");
          return res.status(403).send("Invalid token");
        }
      } catch (err) {
        console.error("🔒 Token verification error:", err);
        return res.status(403).send("Invalid token");
      }
    }

    const basePath = path.join("/data/uploads/private/videos", videoId);
    
    // Path traversal protection
    if (!path.resolve(basePath, requestedFile).startsWith(path.resolve(basePath))) {
      console.error("🚨 Path traversal attempt:", requestedFile);
      return res.status(403).send("Invalid path");
    }

    const filePath = path.join(basePath, requestedFile);

    // Handle missing files - especially master.m3u8
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      
      // If master.m3u8 is missing, create it on-the-fly
      if (requestedFile === "master.m3u8") {
        console.log("🔄 Generating master playlist on-the-fly");
        
        let masterContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,NAME="720p"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,NAME="1080p"
1080p/playlist.m3u8`;

        // Add token to variant URLs for private videos
        if (!isPublic && token) {
          masterContent = masterContent.replace(
            /(playlist\.m3u8)/g,
            `$1?token=${token}`
          );
        }

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        console.log("✅ Served dynamically generated master playlist");
        return res.send(masterContent);
      }
      
      return res.status(404).send("File not found");
    }

    // Handle playlists (.m3u8 files)
    if (requestedFile.endsWith(".m3u8")) {
      let playlist = fs.readFileSync(filePath, "utf8");
      
      // Debug logging
      console.log(`📋 Serving ${requestedFile}, Size: ${playlist.length} chars`);
      
      // For private videos, rewrite URLs to include token
      if (!isPublic && token) {
        console.log(`🔐 Adding token to playlist: ${token.substring(0, 20)}...`);
        
        // For variant playlists (720p/playlist.m3u8, 1080p/playlist.m3u8)
        if (requestedFile.includes("playlist.m3u8")) {
          // Add token to segment URLs
          playlist = playlist.replace(
            /(segment_\d+\.ts)/g,
            `../$1?token=${token}`
          );
          
          // Add token to key URI
          playlist = playlist.replace(
            /URI="([^"]+)"/g,
            `URI="$1?token=${token}"`
          );
        }
        
        // For master playlist
        if (requestedFile === "master.m3u8") {
          playlist = playlist.replace(
            /(720p\/playlist\.m3u8|1080p\/playlist\.m3u8)/g,
            `$1?token=${token}`
          );
        }
      }

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.send(playlist);
    }

    // Handle .ts segments
    if (requestedFile.endsWith(".ts")) {
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      // Handle range requests for seeking
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": "video/mp2t",
          "Cache-Control": "public, max-age=31536000"
        });
        
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
      
      // Full file request
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return fs.createReadStream(filePath).pipe(res);
    }

    // Handle encryption key
    if (requestedFile.endsWith(".key")) {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      return fs.createReadStream(filePath).pipe(res);
    }

    console.error("❌ Unsupported file type:", requestedFile);
    res.status(400).send("Unsupported file type");
    
  } catch (error) {
    console.error("💥 Streaming error:", error);
    res.status(500).send("Server error");
  }
});
router.get("/course/key/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const { token } = req.query;

    console.log(`🔑 Key request for video: ${videoId}`);

    if (!token) {
      console.error("❌ Missing token for key request");
      return res.status(403).send("Missing token");
    }

    try {
      const decoded = Buffer.from(token, "base64url").toString();
      const [userId, courseId, vid] = decoded.split("|");
      
      if (vid !== videoId) {
        console.error("❌ Video ID mismatch in token");
        return res.status(403).send("Invalid token");
      }

      if (!verifyHLSToken(token, userId, courseId, videoId)) {
        console.error("❌ Token verification failed");
        return res.status(403).send("Invalid token");
      }
      
      console.log(`✅ Token valid for user: ${userId}, course: ${courseId}`);
    } catch (err) {
      console.error("🔒 Token decoding error:", err);
      return res.status(403).send("Invalid token format");
    }

    const keyPath = path.join(
      "/data/uploads/private/videos",
      videoId,
      "enc.key"
    );

    if (!fs.existsSync(keyPath)) {
      console.error("❌ Encryption key not found at:", keyPath);
      return res.status(404).send("Key not found");
    }

    console.log(`✅ Serving encryption key for: ${videoId}`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    fs.createReadStream(keyPath).pipe(res);
    
  } catch (error) {
    console.error("💥 Key delivery error:", error);
    res.status(500).send("Server error");
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

// Debug route to check HLS output structure
router.get("/course/debug/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const baseDir = path.join("/data/uploads/private/videos", videoId);
    
    if (!fs.existsSync(baseDir)) {
      return res.json({ error: "Video directory not found", videoId, exists: false });
    }
    
    const structure = {
      videoId,
      baseDir,
      exists: true,
      files: fs.readdirSync(baseDir),
      variants: {}
    };
    
    // Check master playlist
    const masterPath = path.join(baseDir, "master.m3u8");
    if (fs.existsSync(masterPath)) {
      structure.master = {
        exists: true,
        content: fs.readFileSync(masterPath, 'utf8'),
        size: fs.statSync(masterPath).size
      };
    } else {
      structure.master = { exists: false };
    }
    
    // Check variants
    ["720p", "1080p"].forEach(variant => {
      const variantDir = path.join(baseDir, variant);
      const playlistPath = path.join(variantDir, "playlist.m3u8");
      
      structure.variants[variant] = {
        dirExists: fs.existsSync(variantDir),
        playlistExists: fs.existsSync(playlistPath),
        segmentCount: 0,
        segments: []
      };
      
      if (fs.existsSync(variantDir)) {
        const files = fs.readdirSync(variantDir);
        const segments = files.filter(f => f.endsWith('.ts'));
        structure.variants[variant].segmentCount = segments.length;
        structure.variants[variant].segments = segments.slice(0, 5); // First 5
        structure.variants[variant].files = files;
        
        if (fs.existsSync(playlistPath)) {
          structure.variants[variant].playlistContent = fs.readFileSync(playlistPath, 'utf8').substring(0, 500);
        }
      }
    });
    
    res.json(structure);
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Job status route
router.get("/course/status/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const job = videoJobs[videoId];
  
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  res.json({
    videoId,
    status: job.status,
    progress: job.percent,
    ...(job.error && { error: job.error })
  });
});
// Helper function to check HLS output
const checkHLSOutput = async (videoId) => {
  const baseDir = path.join("/data/uploads/private/videos", videoId);
  
  console.log("\n🔍 ===== HLS OUTPUT CHECK =====");
  console.log(`Video ID: ${videoId}`);
  console.log(`Base Directory: ${baseDir}`);
  
  if (!fs.existsSync(baseDir)) {
    console.log("❌ Base directory does not exist!");
    return false;
  }
  
  // Check master playlist
  const masterPath = path.join(baseDir, "master.m3u8");
  if (fs.existsSync(masterPath)) {
    const masterContent = fs.readFileSync(masterPath, 'utf8');
    console.log("✅ Master playlist found:");
    console.log("--- Master Playlist Content ---");
    console.log(masterContent);
    console.log("-----------------------------");
  } else {
    console.log("❌ Master playlist NOT found at:", masterPath);
  }
  
  // Check variants
  const variants = ["720p", "1080p"];
  for (const variant of variants) {
    console.log(`\n📁 Checking ${variant}:`);
    const variantDir = path.join(baseDir, variant);
    
    if (!fs.existsSync(variantDir)) {
      console.log(`❌ ${variant} directory NOT found`);
      continue;
    }
    
    const playlistPath = path.join(variantDir, "playlist.m3u8");
    if (fs.existsSync(playlistPath)) {
      const playlistContent = fs.readFileSync(playlistPath, 'utf8');
      console.log(`✅ ${variant}/playlist.m3u8 found`);
      console.log(`📄 First 3 lines:`);
      console.log(playlistContent.split('\n').slice(0, 3).join('\n'));
      
      // Count segments
      const segments = fs.readdirSync(variantDir).filter(f => f.endsWith('.ts'));
      console.log(`📊 Found ${segments.length} .ts segments`);
      
      if (segments.length > 0) {
        console.log(`📦 Sample segments: ${segments.slice(0, 3).join(', ')}`);
      }
    } else {
      console.log(`❌ ${variant}/playlist.m3u8 NOT found`);
    }
  }
  
  console.log("================================\n");
  return true;
};
export default router;
