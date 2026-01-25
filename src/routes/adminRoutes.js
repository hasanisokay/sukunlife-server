import express from "express";
import lowAdminMiddleware from "../middlewares/lowAdminMiddleware.js";
import strictAdminMiddleware from "../middlewares/strictAdminMiddleware.js";
import dbConnect from "../config/db.mjs";
import { ObjectId } from "mongodb";
import convertToDhakaTime from "../utils/convertToDhakaTime.mjs";
import { uploadPrivateFile } from "../middlewares/uploadPrivateFile.middleware.js";
const router = express.Router();
const db = await dbConnect();
const blogsCollection = db?.collection("blogs");
const usersCollection = db?.collection("users");
const scheduleCollection = db?.collection("schedules");
const appointmentCollection = db?.collection("appointments");
const courseCollection = db?.collection("courses");
const shopCollection = db?.collection("shop");
const voucherCollection = db?.collection("vouchers");
const orderCollection = db?.collection("orders");
const resourceCollection = db?.collection("resources");
const noteCollection = db?.collection("notes");

const appointmentReviewCollection = db?.collection("appointment-reviews");
router.get("/check-blog-url", lowAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const url = query?.url;
    if (url < 1) {
      return res
        .status(400)
        .json({ message: "Url must be at least 1 character long." });
    }
    const isAvailable = await blogsCollection.findOne(
      { blogUrl: url },
      { projection: { _id: 1 } },
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
    if (filter === "admins_only") {
      matchStage.role = "admin";
    }
    if (filter === "users_only") {
      matchStage.role = "user";
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
        enrolledCourses: 1,
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
  },
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
      { $pull: { times: { $in: times } } },
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
    const startDate = query.startDate || "";
    const endDate = query.endDate || "";
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
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      matchStage.bookedDate = { $gte: start, $lte: end };
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
    if (!data.students) {
      data.students = [];
    }
    if (!data.reviews) {
      data.reviews = [];
    }
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
      { projection: { _id: 1 } },
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
      { $set: dataWithoutId },
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

// shops

// check product id is available or not.
router.get("/check-product-id", lowAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const id = query?.id;
    if (id?.length < 1) {
      return res
        .status(400)
        .json({ message: "Product Id must be at least 1 character long." });
    }
    const isAvailable = await shopCollection.findOne(
      { productId: id },
      { projection: { _id: 1 } },
    );
    return res.json({
      message: isAvailable
        ? "Product Id is taken."
        : "Product Id is available.",
      isAvailable: isAvailable ? false : true,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
// add new product
router.post("/add-new-product", strictAdminMiddleware, async (req, res) => {
  try {
    const data = req.body;
    data.reviews = [];
    data.addedOn = convertToDhakaTime(data.addedOn);
    data.price = parseFloat(data.price);
    data.stockQuantity = parseFloat(data.stockQuantity);
    data.quantity = parseFloat(data.quantity);
    const result = await shopCollection.insertOne(data);

    return res.status(200).json({
      message: "Product added successfully.",
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
// delete a product
router.delete("/products/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;
    const result = await shopCollection.deleteOne({ productId });
    if (result.deletedCount > 0) {
      return res
        .status(200)
        .json({ message: "Product deleted.", status: 200, result });
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
// update a product
router.put("/products/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const { _id, ...dataWithoutId } = updateData;
    dataWithoutId.updatedOn = convertToDhakaTime(dataWithoutId.updatedOn);
    dataWithoutId.addedOn = convertToDhakaTime(dataWithoutId.addedOn);
    dataWithoutId.price = parseFloat(dataWithoutId.price);

    const result = await shopCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: dataWithoutId },
    );

    if (result?.matchedCount > 0) {
      return res.status(200).json({
        message: "Product updated successfully.",
        status: 200,
        result,
      });
    } else {
      return res
        .status(404)
        .json({ message: "Product not found.", status: 404 });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

// vouchers

// get all voucher
router.get("/vouchers", strictAdminMiddleware, async (req, res) => {
  try {
    const vouchers = await voucherCollection.find({}).toArray();
    if (!vouchers) {
      return res
        .status(404)
        .json({ message: "No voucher found.", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Vouchers Found", status: 200, vouchers });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
// add new voucher
router.post("/new-voucher", strictAdminMiddleware, async (req, res) => {
  try {
    const data = req.body;
    data.expiryDate = convertToDhakaTime(data.expiryDate);
    const result = await voucherCollection.insertOne(data);

    return res.status(200).json({
      message: "Voucher added successfully.",
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
router.delete("/voucher/:code", strictAdminMiddleware, async (req, res) => {
  try {
    const code = req.params.code;
    const result = await voucherCollection.deleteOne({ code });
    if (result.deletedCount > 0) {
      return res
        .status(200)
        .json({ message: "Voucher deleted.", status: 200, result });
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

router.get("/orders", strictAdminMiddleware, async (req, res) => {
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
        { phone: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        { address: { $regex: keyword, $options: "i" } },
        { transactionId: { $regex: keyword, $options: "i" } },
        { "cartItems.title": { $regex: keyword, $options: "i" } },
      ];
    }
    if (filter === "pending_only") {
      matchStage.status = "pending";
    } else if (filter === "approved_only") {
      matchStage.status = "approved";
    }

    const orders = await orderCollection
      .find(matchStage)
      .sort({ date: sortOrder })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalCount = await orderCollection.countDocuments(matchStage);
    if (!orders) {
      return res.status(404).json({ message: "No order found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Orders Found", status: 200, orders, totalCount });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.delete(
  "/bulk-delete-orders",
  strictAdminMiddleware,
  async (req, res) => {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: "Invalid or empty order IDs" });
    }
    const objectIds = orderIds.map((id) => new ObjectId(id));
    try {
      const result = await orderCollection.deleteMany({
        _id: { $in: objectIds },
      });
      if (result.deletedCount > 0) {
        return res.status(200).json({
          message: `${result?.deletedCount} orders deleted successfully`,
          result,
          status: 200,
        });
      } else {
        return res
          .status(404)
          .json({ message: "No orders found to delete", status: 404 });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Server error", error: error.message, status: 500 });
    }
  },
);

router.put("/approve-order/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, courseIds } = req.body;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID", status: 400 });
    }

    const orderUpdateResult = await orderCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" } },
    );

    if (orderUpdateResult.matchedCount === 0) {
      return res.status(404).json({ message: "Order not found", status: 404 });
    }
    if (courseIds && courseIds?.length > 0) {
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $push: { enrolledCourses: { $each: courseIds } } },
      );
      await courseCollection.updateMany(
        {
          courseId: {
            $in: courseIds.map((c) => c.courseId),
          },
        },
        { $addToSet: { students: userId } },
      );
    }
    return res.status(200).json({
      message: "Order approved successfully",
      status: 200,
      result: orderUpdateResult,
    });
  } catch (error) {
    console.error("Error approving order:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      status: 500,
    });
  }
});

router.get("/dashboard", strictAdminMiddleware, async (req, res) => {
  try {
    const blogCount = await blogsCollection.countDocuments();
    const userCount = await usersCollection.countDocuments({ role: "user" });
    const adminCount = await usersCollection.countDocuments({ role: "admin" });
    const shopProductCount = await shopCollection.countDocuments();
    const pendingOrdersCount = await orderCollection.countDocuments({
      status: "pending",
    });

    const upcomingAppointmentsCount =
      await appointmentCollection.countDocuments({
        bookedDate: { $gt: new Date() },
      });
    const coursesCount = await courseCollection.countDocuments();
    return res.status(200).json({
      data: {
        blogCount,
        userCount,
        adminCount,
        shopProductCount,
        pendingOrdersCount,
        upcomingAppointmentsCount,
        coursesCount,
      },
      message: "Data Found",
      status: 200,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.patch("/:userId/role", strictAdminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role } },
    );
    return res.status(200).json({
      result,
      message: `Users role updated to ${role}`,
      status: 200,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
router.patch("/:userId/status", strictAdminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const { userId } = req.params;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { status } },
    );
    return res.status(200).json({
      result,
      message: `Users status updated to ${status}`,
      status: 200,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.post("/add-new-resource", strictAdminMiddleware, async (req, res) => {
  try {
    const data = req.body;
    data.date = new Date();
    const result = await resourceCollection.insertOne(data);
    return res.status(200).json({
      message: "Resource added successfully.",
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

router.put("/edit-resource/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID", status: 400 });
    }
    const result = await resourceCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data },
    );
    return res.status(200).json({
      message: "Resource updated successfully",
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

router.delete(
  "/resources/bulk-delete",
  strictAdminMiddleware,
  async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Invalid or empty IDs" });
    }
    const objectIds = ids.map((id) => new ObjectId(id));
    try {
      const result = await resourceCollection.deleteMany({
        _id: { $in: objectIds },
      });
      if (result.deletedCount > 0) {
        return res.status(200).json({
          message: `${result?.deletedCount} resources deleted successfully`,
          result,
          status: 200,
        });
      } else {
        return res
          .status(404)
          .json({ message: "No reousrce found to delete", status: 404 });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Server error", error: error.message, status: 500 });
    }
  },
);
// get notes
router.get("/notes", strictAdminMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const limit = parseInt(query.limit) || 100;
    const page = parseInt(query.page) || 1;
    const keyword = query.keyword || "";
    const matchStage = {};
    const sort = query.sort || "newest";
    const sortOrder = sort === "newest" ? -1 : 1;
    const skip = (page - 1) * limit;
    if (keyword) {
      matchStage.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { content: { $regex: keyword, $options: "i" } },
        { lastModifiedBy: { $regex: keyword, $options: "i" } },
      ];
    }

    const notes = await noteCollection
      .find(matchStage)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalCount = await noteCollection.countDocuments(matchStage);
    if (!notes) {
      return res.status(404).json({ message: "No note found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Notes Found", status: 200, notes, totalCount });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});
// edit note
router.put("/reorder-notes", strictAdminMiddleware, async (req, res) => {
  try {
    const {
      draggedNoteId,
      oldPosition,
      newPosition,
      reorderedBy,
      pinnedNotes,
    } = req.body;
    if (oldPosition === newPosition) {
      return {
        status: 200,
        message: "No change in position",
        modifiedCount: 0,
      };
    }
    const sortField = pinnedNotes ? "pinnedPosition" : "position";

    const forwardFilter = {
      [sortField]: { $gt: oldPosition, $lte: newPosition },
    };
    const backwardFilter = {
      [sortField]: { $gte: newPosition, $lt: oldPosition },
    };

    let result;

    if (oldPosition < newPosition) {
      result = await noteCollection.bulkWrite([
        {
          updateMany: {
            filter: {
              _id: { $ne: new ObjectId(draggedNoteId) },
              ...forwardFilter,
            },
            update: {
              $inc: { [sortField]: -1 },
              $set: {
                lastModifiedBy: reorderedBy,
                lastModifiedAt: new Date(),
              },
            },
          },
        },
        {
          updateOne: {
            filter: { _id: new ObjectId(draggedNoteId) },
            update: {
              $set: {
                [sortField]: newPosition,
                lastModifiedBy: reorderedBy,
                lastModifiedAt: new Date(),
              },
            },
          },
        },
      ]);
    } else {
      result = await noteCollection.bulkWrite([
        {
          updateMany: {
            filter: {
              _id: { $ne: new ObjectId(draggedNoteId) },
              ...backwardFilter,
            },
            update: {
              $inc: { [sortField]: 1 },
              $set: {
                lastModifiedBy: reorderedBy,
                lastModifiedAt: new Date(),
              },
            },
          },
        },
        {
          updateOne: {
            filter: { _id: new ObjectId(draggedNoteId) },
            update: {
              $set: {
                [sortField]: newPosition,
                lastModifiedBy: reorderedBy,
                lastModifiedAt: new Date(),
              },
            },
          },
        },
      ]);
    }

    return res.status(200).json({
      message: "Notes reordered successfully",
      status: 200,
      result,
    });
  } catch (error) {
    console.error("Error reordering notes:", error);
    return res.status(500).json({
      message: "Server error while reordering notes",
      error: error.message,
      status: 500,
    });
  }
});
router.put("/update-note/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID", status: 400 });
    }
    delete data._id;
    const result = await noteCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data },
    );
    return res.status(200).json({
      message: "Note updated successfully",
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
// add note
router.post("/add-new-note", strictAdminMiddleware, async (req, res) => {
  try {
    const data = req.body;
    data.createdAt = new Date();
    data.id = Date.now();
    const result = await noteCollection.insertOne(data);
    return res.status(200).json({
      message: "Note added successfully.",
      status: 200,
      result,
      note: data,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      status: 500,
    });
  }
});

// delete note
router.delete("/note/:id", strictAdminMiddleware, async (req, res) => {
  try {
    const noteId = req.params.id;
    const result = await noteCollection.deleteOne({
      _id: new ObjectId(noteId),
    });
    if (result.deletedCount > 0) {
      return res
        .status(200)
        .json({ message: "Note deleted.", status: 200, result });
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

// add review
router.post("/add-review", strictAdminMiddleware, async (req, res) => {
  try {
    const { type, name, date, rating, comment, productId, courseId } = req.body;
    const generateUniqueId = (prefix) => {
      return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
    };
    // const generateUniqueId = () => {
    //   return new ObjectId().toString();
    // };
    // --- 1. Basic Input Validation ---
    if (!type || !name || !rating || !comment) {
      return res.status(400).json({
        message:
          "Missing required fields: type, name, rating, comment are required.",
        status: 400,
      });
    }

    if (!["appointment", "product", "course"].includes(type)) {
      return res.status(400).json({
        message:
          "Invalid review type. Must be 'appointment', 'product', or 'course'.",
        status: 400,
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5.",
        status: 400,
      });
    }

    const reviewDate = new Date(date);
    let result;

    if (type === "appointment") {
      const reviewToInsert = {
        appointmentId: generateUniqueId("appt"),
        userId: generateUniqueId("user"),
        name,
        comment,
        rating,
        date: reviewDate,
      };
      result = await appointmentReviewCollection.insertOne(reviewToInsert);
    } else if (type === "product") {
      if (!productId) {
        return res.status(400).json({
          message: "productId is required for product reviews.",
          status: 400,
        });
      }
      if (!ObjectId.isValid(productId)) {
        return res.status(400).json({
          message: "Invalid productId format.",
          status: 400,
        });
      }

      const review = {
        userId: generateUniqueId("user"),
        name,
        rating,
        comment,
        date: reviewDate,
      };

      result = await shopCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $push: { reviews: review } },
      );

      // Check if the product was found and updated
      if (result.matchedCount === 0) {
        return res.status(404).json({
          message: `Product with id ${productId} not found.`,
          status: 404,
        });
      }
    } else if (type === "course") {
      if (!courseId) {
        return res.status(400).json({
          message: "courseId is required for course reviews.",
          status: 400,
        });
      }
      if (!ObjectId.isValid(courseId)) {
        return res.status(400).json({
          message: "Invalid courseId format.",
          status: 400,
        });
      }

      const review = {
        userId: generateUniqueId("user"),
        name,
        rating,
        comment,
        date: reviewDate,
      };

      result = await courseCollection.updateOne(
        { _id: new ObjectId(courseId) },
        { $push: { reviews: review } },
      );

      // Check if the course was found and updated
      if (result.matchedCount === 0) {
        return res.status(404).json({
          message: `Course with id ${courseId} not found.`,
          status: 404,
        });
      }
    }

    // --- 3. Success Response ---
    return res.status(200).json({
      message: "Review added successfully.",
      status: 200,
      result, // Contains the result of the DB operation (insertedId or modifiedCount)
    });
  } catch (error) {
    console.error("Error in /add-review:", error);
    return res.status(500).json({
      message: "Server error while adding review.",
      error: error.message,
      status: 500,
    });
  }
});

router.get(
  "/get-name-and-ids-for-review",
  strictAdminMiddleware,
  async (req, res) => {
    const { type } = req.query;
    let products;
    let courses;
    try {
      if (type === "product") {
        products = await shopCollection
          .find()
          .project({ _id: 1, title: 1 })
          .toArray();
      } else if (type === "course") {
        courses = await courseCollection
          .find()
          .project({ _id: 1, title: 1 })
          .toArray();
      } else {
        products = await shopCollection
          .find()
          .project({ _id: 1, title: 1 })
          .toArray();
        courses = await courseCollection
          .find()
          .project({ _id: 1, title: 1 })
          .toArray();
      }
      return res
        .status(200)
        .json({ message: "Data Found", status: 200, products, courses });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Server error", error: error.message, status: 500 });
    }
  },
);

router.get("/appointments/review/:id", lowAdminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const review = await appointmentReviewCollection.findOne({
      appointmentId: id,
    });
    if (!review) {
      return res.status(404).json({ message: "Review Not Found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Review Found", status: 200, review });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});
router.delete(
  "/appointments/review/:id",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const id = req.params.id;
      const review = await appointmentReviewCollection.deleteOne({
        appointmentId: id,
      });
      if (!review) {
        return res
          .status(404)
          .json({ message: "Review Not Found", status: 404 });
      }
      return res
        .status(200)
        .json({ message: "Review deleted", status: 200, review });
    } catch (error) {
      return res.status(500).json({
        message: "Server error",
        status: 500,
        error: error.message,
      });
    }
  },
);

// video file upload for course
router.post(
  "/course/upload",
  strictAdminMiddleware,
  uploadPrivateFile.single("file"),
  async (req, res) => {
    let type;

    if (req.file.mimetype.startsWith("video/")) {
      type = "video";
    } else if (req.file.mimetype === "application/pdf") {
      type = "pdf";
    } else if (req.file.mimetype.startsWith("audio/")) {
      type = "audio";
    } else if (req.file.mimetype.startsWith("image/")) {
      type = "image";
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    return res.json({
      message: "File uploaded",
      filename: req?.file?.filename,
      originalName: req?.file?.originalname,
      mime: req?.file?.mimetype,
      size: req?.file?.size,
    });
  },
);

export default router;
