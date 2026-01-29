import express from "express";
import dbConnect from "../config/db.mjs";
import userCheckerMiddleware from "../middlewares/userCheckerMiddleware.js";
import dotenv from "dotenv";
import convertDateToDateObject from "../utils/convertDateToDateObject.mjs";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import sendOrderEmailToAdmin from "../utils/sendOrderEmailToAdmin.mjs";
import sendOrderEmailToUser from "../utils/sendOrderEmailToUser.mjs";
import sendAdminBookingConfirmationEmail from "../utils/sendAdminBookingConfirmationEmail.mjs";
import sendUserBookingConfirmationEmail from "../utils/sendUserBookingConfirmationEmail.mjs";
import fs from "fs";
import path from "path";

const router = express.Router();
const db = await dbConnect();
dotenv.config();
const blogsCollection = db?.collection("blogs");
const appointmentCollection = db?.collection("appointments");
const courseCollection = db?.collection("courses");
const shopCollection = db?.collection("shop");
const usersCollection = db?.collection("users");
const voucherCollection = db?.collection("vouchers");
const orderCollection = db?.collection("orders");
const resourceCollection = db?.collection("resources");

const appointmentReviewCollection = db?.collection("appointment-reviews");

let transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_SERVICE_HOST),
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASS,
  },
});

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
router.get(
  "/blogs-with-all-category-limited-to-five",
  userCheckerMiddleware,
  async (req, res) => {
    try {
      const query = req.query;
      const sort = query.sort || "newest";
      const limit = parseInt(query.limit) || 5;
      const sortOrder = sort === "newest" ? -1 : 1;
      const keyword = query.keyword;
      let tags = query.tags;

      const matchStage = {};
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

      // categories without "others"
      const categories = [
        {
          id: "ruqyah",
          label: "Ruqyah",
          keywords: ["ruqyah", "রুকইয়াহ", "রুকইয়া", "ruqya"],
        },
        {
          id: "black-magic",
          label: "Black Magic",
          keywords: [
            "black-magic",
            "black magic",
            "blackmagic",
            "magic",
            "যাদু",
            "কালো জাদু",
          ],
        },
        {
          id: "evil-eye",
          label: "Evil Eye",
          keywords: [
            "evil-eye",
            "evil eye",
            "evileye",
            "evil",
            "eye",
            "নজর",
            "বদনজর",
            "দুষ্ট নজর",
          ],
        },
        {
          id: "jinn-problem",
          label: "Jinn Problem",
          keywords: [
            "jinn-problem",
            "jinn",
            "jinn problem",
            "জিন",
            "জীন",
            "জ্বিন",
            "জ্বীন",
            "জ্বিন সমস্যা",
          ],
        },
      ];

      const results = {};

      // handle the 4 main categories
      for (const cat of categories) {
        const categoryMatch = {
          ...matchStage,
          blogTags: { $in: cat.keywords },
        };

        const blogs = await blogsCollection
          .find(categoryMatch)
          .sort({ date: sortOrder })
          .limit(limit)
          .project({
            title: 1,
            content: 1,
            blogUrl: 1,
            blogCoverPhoto: 1,
            blogTags: 1,
          })
          .toArray();

        results[cat.id] = blogs;
      }

      // handle "others"
      const excludedTags = categories.flatMap((cat) => cat.keywords);

      const othersMatch = {
        ...matchStage,
        blogTags: { $nin: excludedTags }, // not in any of the above
      };

      const othersBlogs = await blogsCollection
        .find(othersMatch)
        .sort({ date: sortOrder })
        .limit(limit)
        .project({
          title: 1,
          content: 1,
          blogUrl: 1,
          blogCoverPhoto: 1,
          blogTags: 1,
        })
        .toArray();

      results["others"] = othersBlogs;

      return res.status(200).json({
        message: "Blogs Found",
        status: 200,
        categories: results,
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

router.get("/blogs-by-tag", userCheckerMiddleware, async (req, res) => {
  try {
    const query = req.query;
    const sort = query.sort || "newest";
    const limit = parseInt(query.limit) || 5;
    const skip = parseInt(query.skip) || 0;
    const sortOrder = sort === "newest" ? -1 : 1;
    const keyword = query.keyword;
    const tag = query.tag;

    if (!tag) {
      return res.status(400).json({
        message: "Tag is required",
        status: 400,
      });
    }

    const matchStage = {};
    if (req?.user && req?.user?.role !== "admin") {
      matchStage.postStatus = "public";
    }

    // predefined main categories with keywords
    const categories = [
      {
        id: "ruqyah",
        keywords: ["ruqyah", "রুকইয়াহ", "রুকইয়া", "ruqya"],
      },
      {
        id: "black-magic",
        keywords: [
          "black-magic",
          "black magic",
          "blackmagic",
          "magic",
          "যাদু",
          "কালো জাদু",
        ],
      },
      {
        id: "evil-eye",
        keywords: [
          "evil-eye",
          "evil eye",
          "evileye",
          "evil",
          "নজর",
          "বদনজর",
          "দুষ্ট নজর",
        ],
      },
      {
        id: "jinn-problem",
        keywords: [
          "jinn-problem",
          "jinn",
          "jin",
          "jinn problem",
          "জিন",
          "জীন",
          "জ্বিন",
          "জ্বীন",
          "জ্বিন সমস্যা",
        ],
      },
    ];

    if (tag === "others") {
      const excludedTags = categories.flatMap((cat) => cat.keywords);
      matchStage.blogTags = { $nin: excludedTags };
    } else {
      matchStage.blogTags = { $in: [tag] };
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
      .limit(limit)
      .skip(skip)
      .project({
        title: 1,
        content: 1,
        blogUrl: 1,
        blogCoverPhoto: 1,
        blogTags: 1,
      })
      .toArray();

    return res.status(200).json({
      message: "Blogs Found",
      status: 200,
      tag: tag,
      blogs,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

router.get(
  "/similar-blogs-by-tags",
  userCheckerMiddleware,
  async (req, res) => {
    try {
      const query = req.query;
      let limit = parseInt(query.limit);
      const page = parseInt(query.page);
      const keyword = query.keyword;
      let tags = query?.tags?.split(",").map((t) => t.trim());
      let skippingBlogUrl = query.skippingBlogUrl;
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
      matchStage.blogUrl = { $ne: skippingBlogUrl };

      const orConditions = [];

      if (tags?.length) {
        orConditions.push({ blogTags: { $in: tags } });
      }

      if (keyword) {
        orConditions.push(
          { title: { $regex: keyword, $options: "i" } },
          { content: { $regex: keyword, $options: "i" } },
          { blogUrl: { $regex: keyword, $options: "i" } },
          { seoDescription: { $regex: keyword, $options: "i" } },
        );
      }

      if (orConditions.length) {
        matchStage.$or = orConditions;
      }

      let blogs = await blogsCollection
        .find(matchStage)
        .sort({ date: sortOrder })
        .skip(skip)
        .limit(limit)
        .toArray();

      if (blogs?.length < limit) {
        const remaining = limit - blogs.length;

        const extraBlogs = await blogsCollection
          .find({
            blogUrl: { $ne: skippingBlogUrl },
            postStatus: "public",
            _id: { $nin: blogs.map((b) => b._id) }, // avoid duplicates
          })
          .sort({ date: -1 })
          .limit(remaining)
          .toArray();

        blogs = [...blogs, ...extraBlogs];
      }

      if (!blogs.length) {
        return res
          .status(404)
          .json({ message: "No blog found", status: 404, blogs: [] });
      }

      return res
        .status(200)
        .json({ message: "Blogs Found", status: 200, blogs });
    } catch (error) {
      return res.status(500).json({
        message: "Server error",
        status: 500,
        error: error.message,
      });
    }
  },
);
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

router.post("/book-appointment", async (req, res) => {
  try {
    const bookingData = req.body;
    const modifiedBookingData = bookingData;
    modifiedBookingData.bookedDate = convertDateToDateObject(bookingData.date);
    modifiedBookingData.bookingDate = new Date();

    const result = await appointmentCollection.insertOne(modifiedBookingData);
    // if (result?.insertedId) {
    //   await Promise.all([
    //     sendAdminBookingConfirmationEmail(bookingData, transporter),
    //     sendUserBookingConfirmationEmail(bookingData, transporter),
    //   ]);

    //   return res.status(200).json({
    //     message: "Booked successfully.",
    //     result,
    //     status: 200,
    //   });
    // }
    if (result?.insertedId) {
      Promise.all([
        sendAdminBookingConfirmationEmail(bookingData, transporter),
        sendUserBookingConfirmationEmail(bookingData, transporter),
      ]).catch((err) => {
        console.error("Email error:", err);
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
        instructorImage: 1,
        aboutInstructor: 1,
        duration: 1,
        instructorDesignation: 1,
        shortDescription: 1,
        additionalMaterials: 1,
        courseIncludes: 1,
        tags: 1,
        courseId: 1,
        learningItems: 1,
        coverPhotoUrl: 1,
        addedOn: 1,
        updatedOn: 1,
        reviews: 1,
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
        modules: 1
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
    const sort = "newest";
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
            duration: 1,
            instructor: 1,
            shortDescription: 1,
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

// shops
//get all the product categories
router.get("/all-product-categories", async (req, res) => {
  try {
    const categories = await shopCollection.distinct("category");
    if (categories.length < 1) {
      return res.status(404).json({
        message: "No shop category found.",
      });
    }

    return res.status(200).json({
      message: "Shop categories fetched successfully.",
      categories,
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
// get a single product details
router.get("/product/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const matchStage = { productId };
    const product = await shopCollection.findOne(matchStage);
    if (!product) {
      return res
        .status(404)
        .json({ message: "Product Not Found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Product Found", status: 200, product });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});
// get all the products
router.get("/products", async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit);
    const page = parseInt(query.page);
    const keyword = query.keyword;
    let tags = query.tags;
    let category = query.category;
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
    if (tags) {
      matchStage.tags = { $regex: tags, $options: "i" };
    }

    if (category) {
      matchStage.category = { $in: [category] };
    }
    if (keyword) {
      matchStage.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { material: { $regex: keyword, $options: "i" } },
        { brand: { $regex: keyword, $options: "i" } },
      ];
    }

    const products = await shopCollection
      .aggregate([
        { $match: matchStage },
        { $sort: { addedOn: sortOrder } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            title: 1,
            productId: 1,
            description: 1,
            price: 1,
            images: 1,
            colorVariants: 1,
            sizeVariants: 1,
            unit: 1,
            variantPrices: 1,
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
    const totalCount = await shopCollection.countDocuments(matchStage);
    if (!products) {
      return res.status(404).json({ message: "No product found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Products Found", status: 200, products, totalCount });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

// save to cart
router.put("/cart/update", async (req, res) => {
  try {
    const { userId, cart } = req.body;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { cart } },
    );
    if (result.modifiedCount > 0) {
      return res.status(200).json({
        message: "Cart updated successfully.",
        result,
        status: 200,
      });
    } else {
      return res.status(400).json({
        message: "No update made",
        status: 400,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

router.get("/cart/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const matchStage = { _id: new ObjectId(userId) };
    const cart = await usersCollection.findOne(matchStage, {
      projection: { _id: 1, cart: 1 },
    });
    if (!cart) {
      return res
        .status(404)
        .json({ message: "User cart not found", status: 404 });
    }
    return res.status(200).json({ message: "Cart found", status: 200, cart });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

router.get("/check-voucher", async (req, res) => {
  try {
    const query = req.query;
    const code = query?.code;
    const totalPrice = parseFloat(query?.totalPrice);
    if (!code || code.length < 1) {
      return res.status(400).json({
        message: "Voucher code must be at least 1 character long.",
        isValid: false,
      });
    }

    if (isNaN(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({
        message: "Total price must be a valid positive number.",
        isValid: false,
        status: 400,
      });
    }

    const voucher = await voucherCollection.findOne({ code });

    if (!voucher) {
      return res
        .status(404)
        .json({ message: "Invalid voucher.", isValid: false, status: 404 });
    }

    if (voucher.expiryDate) {
      const currentDate = new Date();
      const expiryDate = new Date(voucher.expiryDate);

      if (currentDate > expiryDate) {
        return res.status(422).json({
          message: "Voucher has expired.",
          isValid: false,
          status: 422,
        });
      }
    }

    // Check if the totalPrice meets the minimum order limit
    if (totalPrice < parseFloat(voucher.minOrderLimit)) {
      return res.status(422).json({
        message: `Total price must be at least ${voucher.minOrderLimit} to apply this voucher.`,
        isValid: false,
        status: 422,
      });
    }

    // Calculate discount based on voucher type
    let discount = 0;
    if (voucher.type === "percentage") {
      discount = (totalPrice * parseFloat(voucher.value)) / 100;
    } else if (voucher.type === "amount") {
      discount = parseFloat(voucher.value);
    }

    // Ensure that the discount doesn't exceed the maxLimit
    if (voucher.maxLimit && discount > parseFloat(voucher.maxLimit)) {
      discount = parseFloat(voucher.maxLimit);
    }

    // Calculate the final price after discount
    const finalPrice = totalPrice - discount;

    return res.status(200).json({
      message: "Voucher applied.",
      voucher,
      discount,
      finalPrice,
      status: 200,
      isValid: true,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message, status: 500 });
  }
});

router.post("/place-order", async (req, res) => {
  try {
    const data = req.body;
    data.status = "pending";
    const result = await orderCollection.insertOne(data);

    if (result?.insertedId) {
      await sendOrderEmailToAdmin(data, transporter);
      if (data.email) {
        await sendOrderEmailToUser(data, data?.email, transporter);
      }
      return res.status(200).json({
        message: "Order placed successfully.",
        result,
        status: 200,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});
router.put("/update-stock-quantity", async (req, res) => {
  const data = req.body;
  try {
    // Prepare an array of update operations
    const updateOps = data.map((item) => {
      return {
        updateOne: {
          filter: { _id: new ObjectId(item?._id) },
          update: {
            $inc: {
              stockQuantity: -item.quantity, // Decrease stock
              sold: item.quantity, // Increase sold
            },
          },
        },
      };
    });

    // Perform the bulk write operation
    const result = await shopCollection.bulkWrite(updateOps);

    res.status(200).send({
      message: "Stock and sold quantities updated successfully",
      result,
    });
  } catch (err) {
    console.error("Error updating stock and sold quantities:", err);
    res
      .status(500)
      .send({ message: "Error updating stock and sold quantities" });
  }
});

router.get("/user-enrolled-courses/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { _id: 1, enrolledCourses: 1 } },
    );
    if (result?.enrolledCourses) {
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
});

router.get("/top-sold-items", async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit || 5);
    let topSoldItems;

    topSoldItems = await shopCollection
      .aggregate([
        {
          $match: {
            stockQuantity: { $gt: 0 },
            sold: { $gte: 0 },
          },
        },
        {
          $sort: { sold: -1 },
        },
        {
          $project: {
            _id: 1,
            images: 1,
            description: 1,
            productId: 1,
            title: 1,
            price: 1,
            reviewsCount: { $size: "$reviews" }, // Count the number of reviews
            ratingSum: {
              // Sum up the ratings for each review
              $cond: {
                if: { $gt: [{ $size: "$reviews" }, 0] }, // Check if there are any reviews
                then: { $sum: "$reviews.rating" }, // Sum up the ratings if reviews exist
                else: 0, // If no reviews, set ratingSum to 0
              },
            },
          },
        },
        {
          $limit: limit, // Limit the number of items to the requested limit
        },
      ])
      .toArray();
    if (topSoldItems?.length === 0) {
      topSoldItems = await shopCollection
        .aggregate([
          {
            $match: {
              stockQuantity: { $gt: 0 },
            },
          },
          {
            $sort: { addedOn: -1 },
          },
          {
            $project: {
              _id: 1,
              images: 1,
              description: 1,
              productId: 1,
              title: 1,
              price: 1,
              reviewsCount: { $size: "$reviews" }, // Count the number of reviews
              ratingSum: {
                // Sum up the ratings for each review
                $cond: {
                  if: { $gt: [{ $size: "$reviews" }, 0] }, // Check if there are any reviews
                  then: { $sum: "$reviews.rating" }, // Sum up the ratings if reviews exist
                  else: 0, // If no reviews, set ratingSum to 0
                },
              },
            },
          },
          {
            $limit: limit, // Limit the number of items to the requested limit
          },
        ])
        .toArray();
    }
    res.status(200).json({
      message: `Top ${limit} most sold items`,
      data: topSoldItems,
      status: 200,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ status: 500, message: "Error fetching top sold items" });
  }
});
router.get("/top-courses", async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit || 5);
    let courses;
    courses = await courseCollection
      .aggregate([
        { $match: { students: { $ne: [] } } },
        { $sort: { studentsCount: -1 } },
        { $limit: limit },
        {
          $project: {
            title: 1,
            price: 1,
            instructor: 1,
            // instructorImage: 1,
            description: 1,
            duration: 1,
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
    if (courses?.length === 0) {
      courses = await courseCollection
        .aggregate([
          { $sort: { addedOn: -1 } },
          { $limit: limit },
          {
            $project: {
              title: 1,
              price: 1,
              instructor: 1,
              // instructorImage: 1,
              description: 1,
              duration: 1,
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
    }
    return res.status(200).json({
      message: `Top ${courses?.length} course items`,
      courses,
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .send({ status: 500, message: "Error fetching top courses." });
  }
});

router.get("/resources", async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit) || 5;
    const page = parseInt(query.page) || 1;
    let skip;
    skip = parseInt(query.skip);
    const keyword = query.keyword;
    const type = query.type;
    const matchStage = {};
    const sort = query.sort || "newest";
    const subType = query.subType || "";
    const sortOrder = sort === "newest" ? -1 : 1;

    if (subType !== "all" && subType) {
      matchStage.topic = subType;
    }

    if (keyword) {
      matchStage.$or = [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ];
    }
    if (type !== "all") {
      matchStage.type = type;
    }
    if (!skip) {
      skip = (page - 1) * limit;
    }
    let resources;
    if (type !== "all") {
      resources = await resourceCollection
        .find(matchStage)
        .sort({ date: sortOrder })
        .skip(skip)
        .limit(limit)
        .toArray();
    } else {
      resources = await resourceCollection
        .aggregate([
          {
            $facet: {
              audio: [
                { $match: { type: "audio" } },
                { $sort: { date: sortOrder } },
                { $limit: limit },
              ],
              video: [
                { $match: { type: "video" } },
                { $sort: { date: sortOrder } },
                { $limit: limit },
              ],
              literature: [
                { $match: { type: "literature" } },
                { $sort: { date: sortOrder } },
                { $limit: limit },
              ],
              quran: [
                { $match: { type: "quran" } },
                { $sort: { date: sortOrder } },
                { $limit: limit },
              ],
            },
          },
        ])
        .toArray();
    }
    const totalCount = await resourceCollection.countDocuments(matchStage);
    let videoTopics;
    if (type === "video") {
      videoTopics = await resourceCollection
        .aggregate([
          {
            $match: { type: "video" },
          },
          {
            $group: {
              _id: "$topic",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              topic: "$_id",
              count: 1,
            },
          },
          {
            $sort: { topic: 1 },
          },
        ])
        .toArray();
    }

    return res.status(200).json({
      message: "Success",
      status: 200,
      totalCount,
      videoTopics,
      resources,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});
router.get("/resource/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const matchStage = { _id: new ObjectId(id) };
    const resource = await resourceCollection.findOne(matchStage);
    if (!resource) {
      return res
        .status(404)
        .json({ message: "Resource Not Found", status: 404 });
    }
    return res
      .status(200)
      .json({ message: "Resource Found", status: 200, resource });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

router.get("/top-reviews", async (req, res) => {
  try {
    const query = req.query;
    let limit = parseInt(query.limit || 3);
    const [shopReviews, courseReviews, appointmentReviews] = await Promise.all([
      shopCollection
        .find({ "reviews.rating": { $gte: 4 } })
        .limit(limit)
        .project({ _id: 1, reviews: { $elemMatch: { rating: { $gte: 4 } } } })
        .toArray(),

      courseCollection
        .find({ "reviews.rating": { $gte: 4 } })
        .limit(limit)
        .project({ _id: 1, reviews: { $elemMatch: { rating: { $gte: 4 } } } })
        .toArray(),
      appointmentReviewCollection
        .find({ rating: { $gte: 4 } })
        .limit(limit)
        .sort({ date: -1 })
        .toArray(),
    ]);

    return res.status(200).json({
      message: "reviews found",
      status: 200,
      shopReviews,
      courseReviews,
      appointmentReviews,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Server error",
      status: 500,
      error: error.message,
    });
  }
});

// payments

router.post("/initiate-payment", async (req, res) => {
  const { invoice, name, mobile, address, reference } = req.body;

  const payload = {
    merchantId: process.env.PAYSTATION_MERCHANT_ID,
    password: process.env.PAYSTATION_PASSWORD,
    invoice_number: invoice,
    currency: "BDT",
    payment_amount: 500,
    pay_with_charge: 1,
    reference: reference || "Appointment Booking",
    cust_name: name,
    cust_phone: mobile,
    cust_email: "noemail@sukunlife.com",
    cust_address: address,
    callback_url: `${process.env.CLIENT_URL}/api/paystation/callback`,
  };

  try {
    const response = await fetch(
      "https://api.paystation.com.bd/initiate-payment",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Payment initiation failed" });
  }
});

// courses public video routes


router.get(
  "/course/public/stream/:videoId/:file",
  async (req, res) => {
    try {
      const { videoId, file } = req.params;
      if (file.includes("..")) {
        return res.status(400).json({ error: "Invalid file" });
      }

      const baseDir = path.join(
        "/data/uploads/private/videos",
        videoId
      );

      const filePath = path.join(baseDir, file);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Not found" });
      }

      // set correct content type
      if (file.endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      } else if (file.endsWith(".ts")) {
        res.setHeader("Content-Type", "video/mp2t");
      } else {
        return res.status(403).json({ error: "Forbidden file type" });
      }

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Stream error" });
    }
  }
);

export default router;
