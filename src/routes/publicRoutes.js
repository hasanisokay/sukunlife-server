import express from "express";
import dbConnect from "../config/db.mjs";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";
const router = express.Router();
const db = await dbConnect();
const blogsCollection = db.collection("blogs");
const scheduleCollection = db.collection("schedules");

router.get("/blog/:blogUrl", userCheckerMiddleware, async (req, res) => {
  const blogUrl = req.params.blogUrl;
  const matchStage = { blogUrl };
  if (req?.user && req?.user?.role !== "admin") {
    matchStage.postStatus = "public";
  }

  const blog = await blogsCollection.findOne(matchStage);
  if (!blog) {
    return res.status(404).json({ message: "Blog Not Found", status: 404 });
  }
  return res.status(200).json({ message: "Blog Found", status: 200, blog });
});
router.get("/blogs", userCheckerMiddleware, async (req, res) => {
  const query = req.query;
  let limit = parseInt(query.limit);
  const page = parseInt(query.page);
  const keyword = query.keyword;
  let tags = query.tags;
  const matchStage = {};
  const sort = query.sort;
  const sortOrder = sort === "newest" ? -1 : 1;

  let skip = parseInt(query?.skip);
  if (isNaN(skip)) {
    skip = (page - 1) * limit;
  }

  if (skip === 0) {
    limit = page * limit;
  }
  if (req?.user && req?.user?.role !== "admin") {
    matchStage.postStatus = "public";
  }
  if (tags) {
    matchStage.blogTags = { $in: [tags] };
  }
  if (keyword) {
    matchStage.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { content: { $regex: keyword, $options: "i" } },
      { blogUrl: { $regex: keyword, $options: "i" } },
      { seoDescription: { $regex: keyword, $options: "i" } },
    ];
  }

  const blogs = await blogsCollection
    .find(matchStage)
    .sort({ date: sortOrder })
    .skip(skip)
    .limit(limit)
    .toArray();

  const totalCount = await blogsCollection.countDocuments(matchStage);
  if (!blogs) {
    return res.status(404).json({ message: "No blog found", status: 404 });
  }
  return res
    .status(200)
    .json({ message: "Blogs Found", status: 200, blogs, totalCount });
});

router.get("/all-blog-tags", async (req, res) => {
  try {
    const tags = await blogsCollection.distinct("blogTags");
    if (tags.length < 1) {
      return res.status(404).json({
        message: "No blog tag found.",
      });
    }

    return res.json({
      message: "Blog tags fetched successfully.",
      tags,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error,
      status: 500,
    });
  }
});
router.get("/available-appointment-dates", async (req, res) => {
  try {
    const dates = await scheduleCollection.find({}).toArray();
    if (!dates) {
      return res.status(404).json({
        message: "No dates available",
        status: 404,
      });
    }

    return res.status(200).json({
      message: "Dates available.",
      dates,
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error,
      status: 500,
    });
  }
});

export default router;
