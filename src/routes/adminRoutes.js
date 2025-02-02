import express from "express";
import lowAdminMiddleware from "../middlewares/lowAdminMiddleware.js";
import strictAdminMiddleware from "../middlewares/strictAdminMiddleware.js";
import dbConnect from "../config/db.mjs";
import { ObjectId } from "mongodb";
import convertToDhakaTime from "../utils/convertToDhakaTime.mjs";

const router = express.Router();
const db = await dbConnect();
const blogsCollection = db.collection("blogs");
const usersCollection = db.collection("users");
const scheduleCollection = db.collection("schedules");
const appointmentCollection = db.collection("appointments");
const courseCollection = db.collection("courses");

router.get("/check-blog-url", lowAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const url = query?.url;
    if (url < 1) {
      return res
        .status(400)
        .json({ message: "Url must be at least 1 character long." });
    }
    const isAvailable = await scheduleCollection.findOne(
      { blogUrl: url },
      { projection: { _id: 1 } }
    );
    return res.json({
      message: isAvailable ? "Url is taken." : "Url is available.",
      isAvailable: isAvailable ? false : true,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.post("/add-new-blog", strictAdminMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const { date } = data;
    data.date = new Date(date);

    const result = await blogsCollection.insertOne(data);

    return res.status(200).json({
      message: "Blog added successfully.",
      status: 200,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      status: 500,
    });
  }
});
router.put("/update-a-blog/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const blogId = req.params.id;
    const updateData = req.body;
    const { date } = updateData;
    if (date) {
      updateData.date = new Date(date);
    }
    updateData.updatedOn = new Date();

    const filter = { _id: new ObjectId(blogId) };
    const update = { $set: updateData };
    const result = await blogsCollection.updateOne(filter, update);

    if (result?.modifiedCount === 0) {
      return res.status(404).json({
        message: "Blog not found or no changes made.",
        status: 404,
      });
    }

    return res.status(200).json({
      message: "Blog updated successfully.",
      status: 200,
      result,
    });
  } catch (error) {
    // console.error(error)
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      status: 500,
    });
  }
});

router.get("/blogs", lowAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const limit = parseInt(query.limit) || 1000000;
    const page = query.page || 1;
    const keyword = query.keyword || "";
    const tags = query.tags;
    const matchStage = {};

    const sort = query.sort || "newest";
    const sortOrder = sort === "newest" ? -1 : 1;
    const skip = (page - 1) * limit;

    if (tags) {
      matchStage.tags = { $in: [tags] };
    }

    if (keyword) {
      matchStage.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { authorName: { $regex: keyword, $options: "i" } },
        { content: { $regex: keyword, $options: "i" } },
        { blogUrl: { $regex: keyword, $options: "i" } },
        { seoDescription: { $regex: keyword, $options: "i" } },
      ];
    }

    const blogs = await blogsCollection
      .find(matchStage)
      .project({
        _id: 1,
        title: 1,
        date: 1,
        blogUrl: 1,
        authorName: 1,
        postStatus: 1,
      })
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.delete("/blog/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const blogId = req.params.id;
    const result = await blogsCollection.deleteOne({
      _id: new ObjectId(blogId),
    });
    if (result.deletedCount > 0) {
      return res
        .status(200)
        .json({ message: "Blog deleted.", status: 200, result });
    } else {
      return res
        .status(404)
        .json({ message: "Could not delete. Try again", status: 404 });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.get("/blog/:blogUrl", lowAdminMiddleware, async (req, res) => {
  try {
    const blogUrl = req.params.blogUrl;
    const matchStage = { blogUrl };
    const blog = await blogsCollection.findOne(matchStage);
    if (!blog) {
      return res.status(404).json({ message: "Blog Not Found", status: 404 });
    }
    return res.status(200).json({ message: "Blog Found", status: 200, blog });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

//users
router.get("/users", lowAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const limit = parseInt(query.limit) || 1000000;
    const page = query.page || 1;
    const keyword = query.keyword || "";
    const filter = query.filter;
    const matchStage = {};

    const sort = query.sort || "newest";
    const sortOrder = sort === "newest" ? -1 : 1;
    const skip = (page - 1) * limit;

    if (keyword) {
      matchStage.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { mobile: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
      ];
    }

    const users = await usersCollection
      .find(matchStage)
      .project({
        _id: 1,
        name: 1,
        mobile: 1,
        email: 1,
        photoUrl: 1,
        role: 1,
        status: 1,
        joined: 1,
      })
      .sort({ joined: sortOrder })
      .skip(skip)
      .limit(limit)
      .toArray();
    const totalCount = await usersCollection.countDocuments(matchStage);
    if (!users) {
      return res.status(404).json({ message: "No user found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Users Found", status: 200, users, totalCount });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.post(
  "/add-appointment-dates",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const data = req.body;

      const result = await scheduleCollection.insertMany(data);
      const insertedIds = Object.values(result.insertedIds); // Extract the inserted ObjectIds
      const insertedDocs = await scheduleCollection
        .find({ _id: { $in: insertedIds } })
        .toArray();

      return res.status(200).json({
        message: "Appointment dates added successfully.",
        status: 200,
        dates: insertedDocs, // Return the newly added documents
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500,
      });
    }
  }
);

router.delete("/schedules", strictAdminMiddleware, async (req, res) => {
  try {
    const { dateIds, times } = req.body;

    if (!Array.isArray(dateIds) || !Array.isArray(times)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid request data." });
    }
    const objectIds = dateIds.map((id) => new ObjectId(id));

    // Remove selected times from the dates
    await scheduleCollection.updateMany(
      { _id: { $in: objectIds } },
      { $pull: { times: { $in: times } } }
    );

    // Delete dates that have no times left
    await scheduleCollection.deleteMany({
      _id: { $in: objectIds },
      times: { $size: 0 },
    });

    return res.json({
      status: 200,
      message: "Selected dates and times deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting schedules:", error);
    return res
      .status(500)
      .json({ status: 500, message: "Internal Server Error." });
  }
});

router.get("/appointments", strictAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit) || 1000000;
    const page = query.page || 1;
    const keyword = query.keyword || "";
    const matchStage = {};
    const filter = query.filter || "upcoming";
    const sort = query.sort || "newest";
    const sortOrder = sort === "newest" ? -1 : 1;
    let skip = parseInt(query?.skip);
    if (isNaN(skip)) {
      skip = (page - 1) * limit;
    }
    if (skip === 0) {
      limit = page * limit;
    }
    if (filter === "upcoming") {
      matchStage.bookedDate = { $gte: new Date() };
    }
    if (filter === "with_advance_payment") {
      matchStage.advancePayment = true;
    }
    if (filter === "without_advance_payment") {
      matchStage.advancePayment = false;
    }
    if (filter === "finished") {
      matchStage.bookedDate = { $lte: new Date() };
    }
    if (keyword) {
      matchStage.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { mobile: { $regex: keyword, $options: "i" } },
        { problem: { $regex: keyword, $options: "i" } },
        { transactionNumber: { $regex: keyword, $options: "i" } },
      ];
    }

    const appointments = await appointmentCollection
      .find(matchStage)
      .sort({ bookedDate: sortOrder })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalCount = await appointmentCollection.countDocuments(matchStage);
    if (!appointments) {
      return res
        .status(404)
        .json({ message: "No apppointment found", status: 404 });
    }
    return res.status(200).json({
      message: "Appointments found",
      status: 200,
      appointments,
      totalCount,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.delete("/appointments", strictAdminMiddleware, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "Invalid or empty IDs array" });
  }
  const idsWithObjectId = ids.map((i) => new ObjectId(i));
  try {
    const result = await appointmentCollection.deleteMany({
      _id: { $in: idsWithObjectId },
    });
    if (result.deletedCount > 0) {
      return res
        .status(200)
        .json({ message: "Appointments deleted successfully", status: 200 });
    } else {
      return res
        .status(404)
        .json({ message: "No appointments found to delete", status: 404 });
    }
  } catch (error) {
    console.error("Error deleting appointments:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", status: 500 });
  }
});

// courses
router.post("/add-new-course", strictAdminMiddleware, async (req, res) => {
  try {
    const data = req.body;
    data.addedOn = convertToDhakaTime(data.addedOn);
    data.price = parseFloat(data.price);
    const result = await courseCollection.insertOne(data);

    return res.status(200).json({
      message: "Course added successfully.",
      status: 200,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      status: 500,
    });
  }
});

router.get("/check-course-id", lowAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const id = query?.id;
    if (id < 1) {
      return res
        .status(400)
        .json({ message: "Id must be at least 1 character long." });
    }
    const isAvailable = await courseCollection.findOne(
      { courseId: id },
      { projection: { _id: 1 } }
    );

    return res.json({
      message: isAvailable ? "Id is taken." : "Id is available.",
      isAvailable: isAvailable ? false : true,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.get("/course/:courseId", strictAdminMiddleware, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const matchStage = { courseId };
    const course = await courseCollection.findOne(matchStage);
    if (!course) {
      return res.status(404).json({ message: "Course Not Found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Course Found", status: 200, course });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.get("/courses", strictAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const limit = parseInt(query.limit) || 1000000;
    const page = query.page || 1;
    const keyword = query.keyword || "";
    const sort = query.sort || "newest";
    const sortOrder = sort === "newest" ? -1 : 1;
    const skip = (page - 1) * limit;

    const matchStage = {};

    if (keyword) {
      matchStage.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { instructor: { $regex: keyword, $options: "i" } },
        { courseId: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { seoDesctioption: { $regex: keyword, $options: "i" } },
        { tags: { $regex: keyword, $options: "i" } },
      ];
    }
    const courses = await courseCollection
      .find(matchStage)
      .project({
        _id: 1,
        title: 1,
        courseId: 1,
        description: 1,
        instructor: 1,
        addedOn: 1,
        coverPhotoUrl: 1,
      })
      .sort({ addedOn: sortOrder })
      .skip(skip)
      .limit(limit)
      .toArray();
    if (!courses) {
      return res.status(404).json({ message: "Course Not Found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Course Found", status: 200, courses });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.delete("/course/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const courseId = req.params.id;
    const result = await courseCollection.deleteOne({ courseId });
    if (result.deletedCount > 0) {
      return res
        .status(200)
        .json({ message: "Course deleted.", status: 200, result });
    } else {
      return res
        .status(404)
        .json({ message: "Could not delete. Try again", status: 404 });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.put("/course/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const courseId = req.params.id;
    const updateData = req.body;

    const { _id, ...dataWithoutId } = updateData;
    dataWithoutId.updatedOn = convertToDhakaTime(dataWithoutId.updatedOn);
    dataWithoutId.addedOn = convertToDhakaTime(dataWithoutId.addedOn);
    dataWithoutId.price = parseFloat(dataWithoutId.price);
    
    const result = await courseCollection.updateOne(
      { _id: new ObjectId(courseId) },
      { $set: dataWithoutId }
    );

    if (result?.matchedCount > 0) {
      return res
        .status(200)
        .json({ message: "Course updated successfully.", status: 200, result });
    } else {
      return res
        .status(404)
        .json({ message: "Course not found.", status: 404 });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.post("/settings", strictAdminMiddleware, (req, res) => {
  // Process admin settings
  res.json({ message: "Settings updated successfully!" });
});

export default router;
