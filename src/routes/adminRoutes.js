import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { addJob, videoJobs } from "../queue/hlsQueue.js";
import { addVideoJob, getVideoJob } from '../queues/index.mjs';
import lowAdminMiddleware from "../middlewares/lowAdminMiddleware.js";
import strictAdminMiddleware from "../middlewares/strictAdminMiddleware.js";
import dbConnect from "../config/db.mjs";
import { ObjectId } from "mongodb";
import convertToDhakaTime from "../utils/convertToDhakaTime.mjs";
import {
  getFolderFromMime,
  uploadPrivateFile,
} from "../middlewares/uploadPrivateFile.middleware.js";

const router = express.Router();
const db = await dbConnect();
const paymentCollection = db?.collection("payments");
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

// ============================================
// Add appointment slots
// ============================================

router.post(
  "/add-appointment-dates",
  strictAdminMiddleware,
  async (req, res) => {
    const { appointments } = req.body;
    try {
      if (!appointments || !Array.isArray(appointments) || appointments.length === 0) {
        return res.status(400).json({
          message: "Invalid data. 'appointments' array is required.",
          status: 400,
        });
      }

      const now = new Date();
      const appointmentsToInsert = appointments?.map(apt => ({
        date: apt?.date,
        startTime: apt?.startTime,
        endTime: apt?.endTime,
        consultants: apt?.consultants,
        createdAt: now,
        dateObject: new Date(apt?.date),
      }));

      // ordered: false to continue inserting even if some fail due to duplicates
      const result = await scheduleCollection.insertMany(
        appointmentsToInsert,
        { ordered: false }
      );

      const insertedIds = Object.values(result.insertedIds);
      const insertedDocs = await scheduleCollection
        .find({ _id: { $in: insertedIds } })
        .toArray();

      return res.status(200).json({
        message: "Appointment dates processed successfully.",
        status: 200,
        summary: {
          total: appointments.length,
          inserted: insertedDocs.length,
          skipped: appointments.length - insertedDocs.length,
        },
        dates: insertedDocs,
      });
    } catch (error) {
      // Handle duplicate key errors gracefully
      if (error.code === 11000) {
        // Some documents were inserted, some were duplicates
        const insertedCount = error.result?.nInserted || 0;
        
        return res.status(200).json({
          message: "Appointment dates processed with some duplicates skipped.",
          status: 200,
          summary: {
            total: appointments.length,
            inserted: insertedCount,
            skipped: appointments.length - insertedCount,
          },
          warning: "Some appointments were skipped due to duplicates.",
        });
      }

      console.error("Error adding appointment dates:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500,
      });
    }
  }
);

// ============================================
// Edit single appointment slot
// ============================================

router.put(
  "/appointment-slot/:id",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { date, startTime, endTime, consultants } = req.body;

      // Validate ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid slot ID",
          status: 400
        });
      }

      // Check if slot exists
      const existingSlot = await scheduleCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!existingSlot) {
        return res.status(404).json({
          message: "Appointment slot not found",
          status: 404
        });
      }

      // Build update object
      const updateData = {};
      if (date) {
        updateData.date = date;
        updateData.dateObject = new Date(date);
      }
      if (startTime) updateData.startTime = startTime;
      if (endTime) updateData.endTime = endTime;
      if (consultants && Array.isArray(consultants)) {
        updateData.consultants = consultants;
      }

      // Check for duplicates if date/time is being changed
      if (date || startTime || endTime) {
        const checkDate = date || existingSlot.date;
        const checkStartTime = startTime || existingSlot.startTime;
        const checkEndTime = endTime || existingSlot.endTime;

        const duplicate = await scheduleCollection.findOne({
          _id: { $ne: new ObjectId(id) },
          date: checkDate,
          startTime: checkStartTime,
          endTime: checkEndTime
        });

        if (duplicate) {
          return res.status(409).json({
            message: "A slot with this date and time already exists",
            status: 409
          });
        }
      }

      // Update the slot
      const result = await scheduleCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      if (result.modifiedCount === 0) {
        return res.status(400).json({
          message: "No changes made to the slot",
          status: 400
        });
      }

      // Fetch updated slot
      const updatedSlot = await scheduleCollection.findOne({
        _id: new ObjectId(id)
      });

      return res.status(200).json({
        message: "Appointment slot updated successfully",
        status: 200,
        slot: updatedSlot
      });
    } catch (error) {
      console.error("Error updating appointment slot:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500
      });
    }
  }
);

// ============================================
// Delete single appointment slot
// ============================================

router.delete(
  "/appointment-slot/:id",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid slot ID",
          status: 400
        });
      }

      // Check if slot exists
      const slot = await scheduleCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!slot) {
        return res.status(404).json({
          message: "Appointment slot not found",
          status: 404
        });
      }

      // Delete the slot
      const result = await scheduleCollection.deleteOne({
        _id: new ObjectId(id)
      });

      return res.status(200).json({
        message: "Appointment slot deleted successfully",
        status: 200,
        deletedSlot: {
          id: id,
          date: slot.date,
          time: `${slot.startTime} - ${slot.endTime}`
        }
      });
    } catch (error) {
      console.error("Error deleting appointment slot:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500
      });
    }
  }
);

// ============================================
// Bulk edit appointment slots
// ============================================

router.put(
  "/appointment-slots/bulk-edit",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const { slotIds, updates, action } = req.body;

      // Validate input
      if (!slotIds || !Array.isArray(slotIds) || slotIds.length === 0) {
        return res.status(400).json({
          message: "Invalid data. 'slotIds' array is required.",
          status: 400
        });
      }

      // Validate all IDs
      const invalidIds = slotIds.filter(id => !ObjectId.isValid(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({
          message: "Invalid slot IDs found",
          status: 400,
          invalidIds: invalidIds
        });
      }

      const objectIds = slotIds.map(id => new ObjectId(id));
      let result;
      let updateOperation = {};

      // Handle different bulk edit actions
      switch (action) {
        case 'add_consultants':
          // Add consultants to existing list (no duplicates)
          if (!updates.consultants || !Array.isArray(updates.consultants)) {
            return res.status(400).json({
              message: "consultants array is required for add_consultants action",
              status: 400
            });
          }
          updateOperation = {
            $addToSet: { consultants: { $each: updates.consultants } }
          };
          break;

        case 'remove_consultants':
          // Remove consultants from list
          if (!updates.consultants || !Array.isArray(updates.consultants)) {
            return res.status(400).json({
              message: "consultants array is required for remove_consultants action",
              status: 400
            });
          }
          updateOperation = {
            $pull: { consultants: { $in: updates.consultants } }
          };
          break;

        case 'replace_consultants':
          // Replace entire consultants array
          if (!updates.consultants || !Array.isArray(updates.consultants)) {
            return res.status(400).json({
              message: "consultants array is required for replace_consultants action",
              status: 400
            });
          }
          updateOperation = {
            $set: { consultants: updates.consultants }
          };
          break;

        case 'update_time':
          // Update time for multiple slots
          const timeUpdates = {};
          if (updates.startTime) timeUpdates.startTime = updates.startTime;
          if (updates.endTime) timeUpdates.endTime = updates.endTime;
          
          if (Object.keys(timeUpdates).length === 0) {
            return res.status(400).json({
              message: "startTime or endTime is required for update_time action",
              status: 400
            });
          }
          updateOperation = { $set: timeUpdates };
          break;

        default:
          return res.status(400).json({
            message: "Invalid action. Allowed: add_consultants, remove_consultants, replace_consultants, update_time",
            status: 400
          });
      }

      // Perform bulk update
      result = await scheduleCollection.updateMany(
        { _id: { $in: objectIds } },
        updateOperation
      );

      // Fetch updated slots
      const updatedSlots = await scheduleCollection
        .find({ _id: { $in: objectIds } })
        .toArray();

      return res.status(200).json({
        message: "Bulk edit completed successfully",
        status: 200,
        summary: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
          action: action
        },
        slots: updatedSlots
      });
    } catch (error) {
      console.error("Error in bulk edit:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500
      });
    }
  }
);

// ============================================
// Bulk delete appointment slots
// ============================================

router.delete(
  "/appointment-slots/bulk-delete",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const { slotIds, filter } = req.body;

      let deleteFilter = {};
      let deletedCount = 0;
      let deletedSlots = [];

      // Option 1: Delete by specific IDs
      if (slotIds && Array.isArray(slotIds) && slotIds.length > 0) {
        // Validate all IDs
        const invalidIds = slotIds.filter(id => !ObjectId.isValid(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({
            message: "Invalid slot IDs found",
            status: 400,
            invalidIds: invalidIds
          });
        }

        const objectIds = slotIds.map(id => new ObjectId(id));
        
        // Fetch slots before deletion (for response)
        deletedSlots = await scheduleCollection
          .find({ _id: { $in: objectIds } })
          .toArray();

        // Delete by IDs
        const result = await scheduleCollection.deleteMany({
          _id: { $in: objectIds }
        });

        deletedCount = result.deletedCount;
      }
      // Option 2: Delete by filter (date, date range, consultant)
      else if (filter && typeof filter === 'object') {
        // Build delete filter
        if (filter.date) {
          deleteFilter.date = filter.date;
        }
        
        if (filter.startDate || filter.endDate) {
          deleteFilter.dateObject = {};
          if (filter.startDate) {
            deleteFilter.dateObject.$gte = new Date(filter.startDate);
          }
          if (filter.endDate) {
            deleteFilter.dateObject.$lte = new Date(filter.endDate);
          }
        }
        
        if (filter.consultant) {
          deleteFilter.consultants = filter.consultant;
        }

        if (Object.keys(deleteFilter).length === 0) {
          return res.status(400).json({
            message: "At least one filter criteria is required (date, startDate, endDate, consultant)",
            status: 400
          });
        }

        // Fetch slots before deletion (for response)
        deletedSlots = await scheduleCollection
          .find(deleteFilter)
          .toArray();

        // Delete by filter
        const result = await scheduleCollection.deleteMany(deleteFilter);
        deletedCount = result.deletedCount;
      } else {
        return res.status(400).json({
          message: "Either 'slotIds' array or 'filter' object is required",
          status: 400
        });
      }

      return res.status(200).json({
        message: "Bulk delete completed successfully",
        status: 200,
        summary: {
          deletedCount: deletedCount,
          deletedSlots: deletedSlots.length
        },
        slots: deletedSlots.map(slot => ({
          id: slot._id,
          date: slot.date,
          time: `${slot.startTime} - ${slot.endTime}`,
          consultants: slot.consultants
        }))
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500
      });
    }
  }
);

// ============================================
// Delete all slots for a specific date
// ============================================

router.delete(
  "/appointment-slots/by-date/:date",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const { date } = req.params;

      // Fetch slots before deletion
      const slots = await scheduleCollection.find({ date: date }).toArray();

      if (slots.length === 0) {
        return res.status(404).json({
          message: "No appointment slots found for this date",
          status: 404,
          date: date
        });
      }

      // Delete all slots for the date
      const result = await scheduleCollection.deleteMany({ date: date });

      return res.status(200).json({
        message: `All appointment slots deleted for ${date}`,
        status: 200,
        deletedCount: result.deletedCount,
        deletedSlots: slots.map(slot => ({
          id: slot._id,
          time: `${slot.startTime} - ${slot.endTime}`,
          consultants: slot.consultants
        }))
      });
    } catch (error) {
      console.error("Error deleting slots by date:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500
      });
    }
  }
);

// ============================================
// Add/Remove consultant from single slot
// ============================================

router.put(
  "/appointment-slot/:id/consultant",
  strictAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { consultant, action } = req.body; // action: 'add' or 'remove'

      // Validate ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid slot ID",
          status: 400
        });
      }

      if (!consultant || !action) {
        return res.status(400).json({
          message: "consultant and action (add/remove) are required",
          status: 400
        });
      }

      const slot = await scheduleCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!slot) {
        return res.status(404).json({
          message: "Appointment slot not found",
          status: 404
        });
      }

      let updateOperation;
      let message;

      if (action === 'add') {
        // Check if consultant already exists
        if (slot.consultants.includes(consultant)) {
          return res.status(409).json({
            message: "Consultant already exists in this slot",
            status: 409
          });
        }
        updateOperation = { $addToSet: { consultants: consultant } };
        message = "Consultant added successfully";
      } else if (action === 'remove') {
        // Check if consultant exists
        if (!slot.consultants.includes(consultant)) {
          return res.status(404).json({
            message: "Consultant not found in this slot",
            status: 404
          });
        }
        updateOperation = { $pull: { consultants: consultant } };
        message = "Consultant removed successfully";
      } else {
        return res.status(400).json({
          message: "Invalid action. Use 'add' or 'remove'",
          status: 400
        });
      }

      // Update the slot
      await scheduleCollection.updateOne(
        { _id: new ObjectId(id) },
        updateOperation
      );

      // Fetch updated slot
      const updatedSlot = await scheduleCollection.findOne({
        _id: new ObjectId(id)
      });

      // If no consultants left after removal, optionally delete the slot
      if (action === 'remove' && updatedSlot.consultants.length === 0) {
        await scheduleCollection.deleteOne({ _id: new ObjectId(id) });
        return res.status(200).json({
          message: "Last consultant removed. Slot deleted.",
          status: 200,
          action: "deleted"
        });
      }

      return res.status(200).json({
        message: message,
        status: 200,
        slot: updatedSlot
      });
    } catch (error) {
      console.error("Error updating consultant:", error);
      return res.status(500).json({
        message: "Server error",
        error: error.message,
        status: 500
      });
    }
  }
);



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
    dataWithoutId.updatedOn = convertToDhakaTime(
      dataWithoutId?.updatedOn || new Date(),
    );
    dataWithoutId.addedOn = convertToDhakaTime(
      dataWithoutId.addedOn || new Date(),
    );
    dataWithoutId.price = parseFloat(dataWithoutId.price || new Date());

    const result = await courseCollection.updateOne(
      { _id: new ObjectId(courseId) },
      { $set: dataWithoutId },
    );

    if (result?.modifiedCount > 0) {
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
    const noteCount = await noteCollection.countDocuments();
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
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const sevenDaysOrderCount = await orderCollection.countDocuments({
      orderedAt: {
        $gte: sevenDaysAgo,
        $lte: now,
      },
    });

    const coursesCount = await courseCollection.countDocuments();
    return res.status(200).json({
      data: {
        blogCount,
        userCount,
        noteCount,
        adminCount,
        shopProductCount,
        pendingOrdersCount,
        upcomingAppointmentsCount,
        coursesCount,
        sevenDaysOrderCount,
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

router.get("/course/video-status/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const job = await getVideoJob(videoId);

    if (!job) {
      return res.status(404).json({
        status: "not_found",
        error: "Video processing job not found",
        message: "The video processing job may have been completed or cleared",
      });
    }

    const state = await job.getState();
    const progress = job.progress || {};
    const now = Date.now();

    // Waiting/Delayed
    if (state === 'waiting' || state === 'delayed') {
      const jobCounts = await job.queue.getJobCounts('waiting', 'delayed', 'active');
      const queuePosition = (jobCounts.waiting || 0) + (jobCounts.delayed || 0);
      const waitTime = job.timestamp ? Math.round((now - job.timestamp) / 1000) : 0;

      return res.json({
        status: "queued",
        percent: 0,
        eta: "waiting...",
        queuePosition: queuePosition + 1,
        totalInQueue: queuePosition + (jobCounts.active || 0),
        waitTime,
        message: `Waiting in queue`,
        queuedAt: job.timestamp,
      });
    }

    // Active/Processing
    if (state === 'active') {
      const processingTime = job.processedOn ? (now - job.processedOn) / 1000 : 0;

      return res.json({
        status: "processing",
        percent: progress.percent || 0,
        eta: progress.eta || "calculating...",
        etaSeconds: progress.etaSeconds || null,
        speed: progress.speed || progress.ffmpegSpeed || null,
        duration: progress.duration || 0,
        processingTime: Math.round(processingTime),
        currentStep: progress.currentStep || "Transcoding video",
        startTime: job.processedOn,
        currentTime: progress.currentTime || 0,
        totalDuration: progress.duration || 0,
      });
    }

    // Completed
    if (state === 'completed') {
      const result = job.returnvalue || {};
      const processingTime = result.processingTime || 
        (job.finishedOn && job.processedOn ? (job.finishedOn - job.processedOn) / 1000 : 0);

      return res.json({
        status: "completed",
        percent: 100,
        eta: "0s",
        duration: result.duration || 0,
        processingTime: Math.round(processingTime),
        totalTime: Math.round(processingTime),
        resolutions: result.resolutions || ['720p', '1080p'],
        message: "Video processing completed successfully",
        completedAt: job.finishedOn,
      });
    }

    // Failed
    if (state === 'failed') {
      const processingTime = job.processedOn ? (now - job.processedOn) / 1000 : 0;

      return res.json({
        status: "failed",
        percent: progress.percent || 0,
        error: job.failedReason || "Video processing failed",
        processingTime: Math.round(processingTime),
        failedAt: job.finishedOn,
        attemptsMade: job.attemptsMade,
        attemptsMax: job.opts.attempts,
      });
    }

    // Default
    res.json({
      status: state || "unknown",
      percent: progress.percent || 0,
      message: `Job is in ${state} state`,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
});


router.post(
  "/course/upload",
  strictAdminMiddleware,
  uploadPrivateFile.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const { status } = req.body;

    // non-video
    const folder = getFolderFromMime(req?.file?.mimetype);
    if (!req.file.mimetype.startsWith("video/")) {
      return res.json({
        message: "File uploaded",
        filename: req.file.filename,
        mime: req.file.mimetype,
        path: `/${folder}/${req.file.filename}`,
      });
    }

    const inputPath = req.file.path;
    const videoId = path.basename(inputPath, path.extname(inputPath));
    const baseDir = path.join("/data/uploads/private/videos", videoId);
    fs.mkdirSync(baseDir, { recursive: true });

    // Create folders that match the playlist names
    const v720p = path.join(baseDir, "720p");
    const v1080p = path.join(baseDir, "1080p");
    fs.mkdirSync(v720p, { recursive: true });
    fs.mkdirSync(v1080p, { recursive: true });

    const keyPath = path.join(baseDir, "key.key");
    const keyInfoPath = path.join(baseDir, "keyinfo.txt");

    let hlsKeyArgs = "";

    if (status === "private") {
      fs.writeFileSync(keyPath, crypto.randomBytes(16));

      const keyUrl = `${process.env.SERVER_URL}/api/user/course/key/${videoId}`;
      fs.writeFileSync(keyInfoPath, `${keyUrl}\n${keyPath}\n`);

      hlsKeyArgs = `-hls_key_info_file "${keyInfoPath}"`;
    }

    // FIXED: Use named variants that match folder names
    const cmd = `
ffmpeg -y -i "${inputPath}" \
-filter_complex "
[0:v]split=2[v1][v2];
[v1]scale=w=1280:h=720:force_original_aspect_ratio=decrease[v720];
[v2]scale=w=1920:h=1080:force_original_aspect_ratio=decrease[v1080]
" \
-map "[v720]" -c:v:0 libx264 -preset veryfast -crf 23 -b:v:0 2500k -maxrate:v:0 3500k -bufsize:v:0 7000k \
-map "[v1080]" -c:v:1 libx264 -preset veryfast -crf 23 -b:v:1 5000k -maxrate:v:1 7000k -bufsize:v:1 14000k \
-map 0:a -c:a:0 aac -b:a:0 128k \
-map 0:a -c:a:1 aac -b:a:1 128k \
-f hls \
-hls_time 6 \
-hls_playlist_type vod \
-hls_flags independent_segments \
-hls_segment_type mpegts \
-g 180 -keyint_min 180 -sc_threshold 0 \
${hlsKeyArgs} \
-hls_segment_filename "${baseDir}/%v/seg_%03d.ts" \
-master_pl_name master.m3u8 \
-var_stream_map "v:0,a:0,name:720p v:1,a:1,name:1080p" \
-hls_list_size 0 \
"${baseDir}/%v/index.m3u8"
`;

    // videoJobs[videoId] = { status: "queued", percent: 0 };

    // addJob(videoId, cmd, async () => {
    //   // Clean up original file after encoding
    //   fs.promises.unlink(inputPath).catch(console.error);

    //   // Log success
    //   console.log(`Video ${videoId} processing completed`);

    //   // Verify master playlist exists
    //   const masterPath = path.join(baseDir, "master.m3u8");
    //   if (fs.existsSync(masterPath)) {
    //     const content = fs.readFileSync(masterPath, "utf8");
    //     console.log("Final master playlist:", content);
    //   }
    // });
   await addVideoJob(videoId, {
        videoId,
        cmd,
        inputPath,
        baseDir,
        status,
      });
    
    res.json({
      message: "Video uploaded. Processing started.",
      videoId,
      filename: videoId,
      path: `/${folder}/${req.file.filename}`,
    });
  },
);

// get payments data
router.get("/payments", strictAdminMiddleware, async (req, res) => {
  try {
    const {
      limit = "20",
      page = "1",
      fulfilled,
      keyword,
      sort = "newest",
      status,
      source,
      startDate,
      endDate,
      includeRaw = "false",
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    const matchStage = {};

    /* -------------------------
       Keyword Search
    -------------------------- */
    if (keyword?.trim()) {
      matchStage.$or = [
        { invoice: { $regex: keyword, $options: "i" } },
        { trx_id: { $regex: keyword, $options: "i" } },
        { "customer.name": { $regex: keyword, $options: "i" } },
        { "customer.email": { $regex: keyword, $options: "i" } },
        { "customer.mobile": { $regex: keyword, $options: "i" } },
      ];
    }

    /* -------------------------
       Boolean Handling
    -------------------------- */
    if (fulfilled === "true") matchStage.fulfilled = true;
    if (fulfilled === "false") matchStage.fulfilled = false;

    /* -------------------------
       Status & Source
    -------------------------- */
    if (status) matchStage.status = status;
    if (source) matchStage.source = source;

    /* -------------------------
       Date Range (Fixed)
    -------------------------- */
    if (startDate || endDate) {
      matchStage.createdAt = {};

      if (startDate) {
        matchStage.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = end;
      }
    }

    const sortOrder = sort === "oldest" ? 1 : -1;
    const projection = includeRaw === "true" ? {} : { raw_response: 0 };

    /* -------------------------
       Query
    -------------------------- */
    const payments = await paymentCollection
      .find(matchStage)
      .project(projection)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(parsedLimit)
      .toArray();

    const totalCount = await paymentCollection.countDocuments(matchStage);

    /* -------------------------
       Stats
    -------------------------- */
    const revenueAgg = await paymentCollection.aggregate([
      { $match: { ...matchStage, status: "paid" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalPaid: { $sum: 1 },
        },
      },
    ]).toArray();

    const totalRevenue = revenueAgg[0]?.totalRevenue || 0;
    const totalPaid = revenueAgg[0]?.totalPaid || 0;

    return res.status(200).json({
      status: 200,
      message: "Payments fetched successfully",
      data: {
        payments,
        pagination: {
          total: totalCount,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(totalCount / parsedLimit),
        },
        stats: {
          totalRevenue,
          totalPaid,
        },
      },
    });

  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
