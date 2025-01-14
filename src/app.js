import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js"
dotenv.config();
const app = express();
const corsOptions = {
    origin: (origin, callback) => {
      const allowedOrigins = ["http://localhost:3000", "https://sunnahcurebd.netlify.app",];
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true); // Allow the origin
      } else {
        console.log(`Blocked by CORS: ${origin}`); // Log blocked origin for debugging
        callback(new Error("Not allowed by CORS"), false); // Reject other origins
      }
    },
    credentials: true, // Allow credentials (cookies, authentication, etc.)
  };
  
  app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", authRoutes);

export default app;
