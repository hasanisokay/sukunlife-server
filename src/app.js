import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://sukunlife.vercel.app",
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

app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));

app.use(express.json());
app.get('/', (req, res) => {
  res.send('Server Is Running!');
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);

export default app;
