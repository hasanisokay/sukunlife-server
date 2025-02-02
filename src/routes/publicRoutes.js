import express from "express";
import dbConnect from "../config/db.mjs";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";
import convertTo12HourFormat from "../utils/convertTo12HourFormat.mjs";
import dotenv from "dotenv";
import convertDateToDateObject from "../utils/convertDateToDateObject.mjs";

const router = express.Router();
const db = await dbConnect();
dotenv.config();
const blogsCollection = db.collection("blogs");
const scheduleCollection = db.collection("schedules");
const appointmentCollection = db.collection("appointments");
const courseCollection = db.collection("courses");
router.get("/blog/:blogUrl", userCheckerMiddleware, async (req, res) => {
  try {
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
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});
router.get("/blogs", userCheckerMiddleware, async (req, res) => {
  try {
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
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
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
      status: 500,
      error: error.message,
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
      status: 500,
      error: error.message,
    });
  }
});

router.post("/book-appointment", async (req, res) => {
  try {
    const bookingData = req.body;
    const { date, time } = bookingData;
    const isAvailable = await scheduleCollection.findOne(
      { date: date },
      { projection: { _id: 1 } }
    );
    if (!isAvailable) {
      return res.status(400).json({
        message:
          "Selected Dates and times not available. Please reload and try again.",
        status: 400,
      });
    }
    const modifiedBookingData = bookingData;
    modifiedBookingData.bookedDate = convertDateToDateObject(bookingData.date);
    modifiedBookingData.bookingDate = new Date();

    const result = await appointmentCollection.insertOne(modifiedBookingData);
    if (result.insertedId) {
      await scheduleCollection.updateMany(
        { date: date },
        { $pull: { times: time } }
      );
      await scheduleCollection.deleteMany({
        date,
        times: { $size: 0 },
      });
      return res.status(200).json({
        message: "Booked successfully.",
        result,
        status: 200,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

router.post("/sendEmail", async (req, res) => {
  try {
    const bookingData = req.body;
    let transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_SERVICE_HOST,
      secure: true,
      auth: {
        user: process.env.EMAIL_ID,
        pass: process.env.EMAIL_PASS,
      },
    });

    let mailOptions = {
      to: "sukunlifebd@gmail.com",
      subject: "New Appointment - SukunLife",
      html: `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Appointment</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
              }
              .email-container {
                  max-width: 600px;
                  margin: 20px auto;
                  background-color: #ffffff;
                  border-radius: 8px;
                  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                  overflow: hidden;
              }
              .email-header {
                  background-color: #5a9433;
                  color: #ffffff;
                  text-align: center;
                  padding: 20px;
              }
              .email-header h2 {
                  margin: 0;
              }
              .email-body {
                  padding: 20px;
                  color: #333333;
              }
              .email-body ul {
                  list-style: none;
                  padding: 0;
              }
              .email-body li {
                  margin-bottom: 10px;
                  font-size: 16px;
              }
              .email-body li strong {
                  color: #5a9433;
              }
              .email-footer {
                  background-color: #f4f4f4;
                  text-align: center;
                  padding: 10px;
                  font-size: 14px;
                  color: #666666;
              }
          </style>
      </head>
      <body>
          <div class="email-container">
              <div class="email-header">
                  <h2>New Appointment Details</h2>
              </div>
              <div class="email-body">
                  <ul>
                      <li><strong>Name:</strong> ${formData.name}</li>
                      <li><strong>Phone Number:</strong> ${
                        bookingData.mobile
                      }</li>
                      <li><strong>Address:</strong> ${bookingData.address}</li>
                      <li><strong>Service:</strong> ${
                        bookingData.service.label
                      }</li>
                      <li><strong>Date:</strong> ${bookingData.date}</li>
                      <li><strong>Time:</strong> ${convertTo12HourFormat(
                        bookingData.time
                      )}</li>
                      <li><strong>Problem:</strong> ${bookingData.problem}</li>
                      <li><strong>Advance Payment:</strong>${
                        bookingData.advancePayment
                          ? `Trx Id: ${bookingData?.transactionNumber}`
                          : bookingData.advancePayment
                      }</li>
                  </ul>
              </div>
              <div class="email-footer">
                  © 2025 SukunLife BD. All rights reserved.
              </div>
          </div>
      </body>
      </html>`,
    };

    try {
      const re = await transporter.sendMail(mailOptions);
      if (re?.messageId) {
        res
          .status(200)
          .send({ status: 200, message: "Email sent successfully" });
      } else {
        res.status(400).send({ status: 400, message: `Email Not Sent` });
      }
    } catch (error) {
      res
        .status(500)
        .send({ status: 500, message: `Error sending email, ${error}` });
    }
  } catch {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

router.get("/course/:id", async (req, res) => {
  try {
    const courseId = req.params.id;
    const matchStage = { courseId };

    const course = await courseCollection.findOne(matchStage, {
      projection: {
        title: 1,
        description: 1,
        price: 1,
        instructor: 1,
        seoDescription: 1,
        tags: 1,
        courseId: 1,
        learningItems: 1,
        addedOn: 1,
        reviews: 1,
        students: 1,
        modules: {
          $map: {
            input: "$modules",
            as: "module",
            in: {
              title: "$$module.title",
              items: {
                $map: {
                  input: "$$module.items",
                  as: "item",
                  in: {
                    $cond: {
                      if: { $eq: ["$$item.status", "public"] },
                      then: "$$item",
                      else: {
                        status: "$$item.status",
                        type: "$$item.type",
                        title: "$$item.title",
                        description: "$$item.description",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ message: "No course found", status: 404 });
    }

    return res.status(200).json({
      message: "Course Found",
      status: 200,
      course,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

router.get("/courses", async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit) || 10;
    const page = parseInt(query.page) || 1;
    const keyword = query.keyword | "";
    let tags = query.tags || "";
    const matchStage = {};
    const sort = 'newest';
    const sortOrder = sort === "newest" ? -1 : 1;

    let skip = parseInt(query?.skip);
    if (isNaN(skip)) {
      skip = (page - 1) * limit;
    }
    if (skip === 0) {
      limit = page * limit;
    }
    if (tags) {
      tags = tags.split(",");
      matchStage.blogTags = { $in: tags };
    }

    if (keyword) {
      matchStage.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { tags: { $regex: keyword, $options: "i" } },
        { content: { $regex: keyword, $options: "i" } },
        { blogUrl: { $regex: keyword, $options: "i" } },
        { seoDescription: { $regex: keyword, $options: "i" } },
      ];
    }

    const courses = await courseCollection
      .aggregate([
        { $match: matchStage },
        { $sort: { date: sortOrder } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            title: 1,
            price: 1,
            instructor: 1,
            tags: 1,
            courseId: 1,
            addedOn: 1,
            updatedOn: 1,
            coverPhotoUrl: 1,
            learningItems: 1,
            studentsCount: { $size: "$students" },
            reviewsCount: { $size: "$reviews" },
            ratingSum: {
              $cond: {
                if: { $gt: [{ $size: "$reviews" }, 0] },
                then: {
                  $sum: "$reviews.rating",
                },
                else: 0,
              },
            },
          },
        },
      ])
      .toArray();

    const totalCount = await courseCollection.countDocuments(matchStage);

    if (!courses.length) {
      return res.status(404).json({ message: "No courses found", status: 404 });
    }

    return res.status(200).json({
      message: "Courses Found",
      status: 200,
      courses,
      totalCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

export default router;
