import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import paystationRoutes from "./routes/paystationRoutes.js";

import path from "path";
import { fileURLToPath } from "url";

// Required for ES Modules (__dirname replacement)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://sukunlife.com",
      "https://www.sukunlife.com",
    ];
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true); // Allow the origin
    } else {
      console.log(`Blocked by CORS: ${origin}`); // Log blocked origin for debugging
      callback(new Error("Not allowed by CORS"), false); // Reject other origins
    }
  },
  credentials: true, 
  optionsSuccessStatus: 200,
};

app.use(express.static("public"));

app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));

app.use(express.json());
app.get('/', (req, res) => {
  res.send('Sukunlife server is running! yo');
});

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/api/auth", authRoutes);
app.use("/api/paystation", paystationRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);

export default app;
