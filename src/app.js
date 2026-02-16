import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import paystationRoutes from "./routes/paystationRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// ============================================================================
// TRUST PROXY - CRITICAL FOR NGINX/CLOUDFLARE
// ============================================================================
// This allows Express to trust X-Forwarded-* headers from Nginx
// Without this, req.ip will be 127.0.0.1 and rate limiting won't work
app.set('trust proxy', 1);

// ============================================================================
// SECURITY HEADERS - HELMET
// ============================================================================
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.sukunlife.com", "https://upload.sukunlife.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false, // Disable CSP in development for easier debugging
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
}));

// ============================================================================
// COMPRESSION - Gzip responses
// ============================================================================
app.use(compression({
  filter: (req, res) => {
    // Don't compress if this is an upload endpoint
    if (req.path.includes('/upload')) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Compression level (0-9, 6 is default and good balance)
}));

// ============================================================================
// LOGGING - MORGAN
// ============================================================================
if (process.env.NODE_ENV === 'production') {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // Create a write stream (in append mode)
  const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
  );

  // Apache combined format for production
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // Colorful dev format for development
  app.use(morgan('dev'));
}

// ============================================================================
// CORS
// ============================================================================
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:5173", // Vite default
      "https://sukunlife.com",
      "https://www.sukunlife.com",
      "https://api.sukunlife.com", 
      "https://upload.sukunlife.com"
    ];

    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
  maxAge: 86400, // Cache preflight requests for 24 hours
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight for all routes

// ============================================================================
// BODY PARSERS - Different limits based on subdomain
// ============================================================================
app.use((req, res, next) => {
  if (req.hostname === 'upload.sukunlife.com') {
    // For upload subdomain - small JSON limit (file uploads handled by multer)
    express.json({ limit: '10mb' })(req, res, next);
  } else {
    // For API subdomain - 10mb JSON limit
    express.json({ limit: '10mb' })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// RATE LIMITING - Different limits based on subdomain
// ============================================================================

// General API rate limiter (100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: { 
    message: 'Too many requests from this IP, please try again later.', 
    status: 429,
    retryAfter: 15 * 60 // seconds
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  }
});

// Upload subdomain rate limiter (20 uploads per hour)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Only 20 large file uploads per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    message: 'Upload limit exceeded. Maximum 20 uploads per hour.', 
    status: 429,
    retryAfter: 60 * 60 // seconds
  }
});

// Auth endpoints rate limiter (5 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 failed requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    message: 'Too many authentication attempts, please try again later.', 
    status: 429,
    retryAfter: 15 * 60 // seconds
  }
});

// Apply rate limiters based on subdomain
app.use((req, res, next) => {
  if (req.hostname === 'upload.sukunlife.com') {
    uploadLimiter(req, res, next);
  } else {
    apiLimiter(req, res, next);
  }
});

// ============================================================================
// STATIC FILES
// ============================================================================
app.use(express.static("public"));

// ============================================================================
// VIEW ENGINE
// ============================================================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================================================================
// HEALTH CHECK ENDPOINTS
// ============================================================================
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Sukunlife server is running!",
    domain: req.hostname,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// ============================================================================
// API ROUTES
// ============================================================================
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/paystation", paystationRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);

// ============================================================================
// 404 HANDLER - Must be after all routes
// ============================================================================
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found', 
    status: 404,
    path: req.path,
    method: req.method
  });
});

// ============================================================================
// GLOBAL ERROR HANDLER - Must be last
// ============================================================================
app.use((err, req, res, next) => {
  // Log error details (but not in tests)
  if (process.env.NODE_ENV !== 'test') {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
  
  // Handle specific error types
  if (err.name === 'PayloadTooLargeError') {
    return res.status(413).json({
      message: 'Payload too large',
      status: 413,
      maxSize: req.hostname === 'upload.sukunlife.com' ? '2GB' : '100MB'
    });
  }

  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      message: 'CORS error: Origin not allowed',
      status: 403
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      message: 'Unauthorized: Invalid token',
      status: 401
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: err.message || 'Validation error',
      status: 400,
      ...(process.env.NODE_ENV !== 'production' && { details: err.details })
    });
  }
  
  // Default error response
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message || 'Something went wrong';

  res.status(status).json({
    message,
    status,
    ...(process.env.NODE_ENV !== 'production' && { 
      stack: err.stack,
      name: err.name 
    })
  });
});

export default app;