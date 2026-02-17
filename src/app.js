import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import IORedis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import paystationRoutes from "./routes/paystationRoutes.js";
import { redisConnection } from "./config/redis.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();


const redisClient = new IORedis(redisConnection);

/*
|--------------------------------------------------------------------------
| Base Sliding Window Limiter
|--------------------------------------------------------------------------
*/

const createLimiter = ({ prefix, points, duration, blockDuration }) =>
  new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: `rl:${prefix}`,
    points,
    duration,
    blockDuration,
  });



const app = express();

// ============================================================================
// TRUST PROXY - CRITICAL FOR NGINX/CLOUDFLARE
// ============================================================================
// This allows Express to trust X-Forwarded-* headers from Nginx
// Without this, req.ip will be 127.0.0.1 and rate limiting won't work
app.set('trust proxy', 2);
// app.set('trust proxy', true);

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

// ================
// RATE LIMITING 
// ================

const apiLimiter = createLimiter({
  prefix: "api",
  points: 100,
  duration: 900,
  blockDuration: 60,
});

const authLimiter = createLimiter({
  prefix: "auth",
  points: 5,
  duration: 900,
  blockDuration: 600,
});

const adminLimiter = createLimiter({
  prefix: "admin",
  points: 50,
  duration: 900,
  blockDuration: 300,
});

const paymentLimiter = createLimiter({
  prefix: "payment",
  points: 20,
  duration: 600,
  blockDuration: 600,
});

const uploadLimiter = createLimiter({
  prefix: "upload",
  points: 20,
  duration: 3600,
  blockDuration: 1800,
});


const rateLimitMiddleware = (limiter) => {
  return async (req, res, next) => {
    try {
      await limiter.consume(req.ip);
      return next();
    } catch (rejRes) {
      if (rejRes instanceof Error) {
        console.error("Rate limiter Redis error:", rejRes);
        return next(); // fail open (do NOT block legit traffic)
      }

      const retrySecs = Math.round(rejRes.msBeforeNext / 1000) || 60;
      res.set("Retry-After", retrySecs);

      return res.status(429).json({
        message: "Too many requests",
        retryAfter: retrySecs,
      });
    }
  };
};





// Apply rate limiters based on subdomain
app.use((req, res, next) => {
  if (req.hostname === "upload.sukunlife.com") {
    return rateLimitMiddleware(uploadLimiter)(req, res, next);
  }
  next();
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
app.use("/api", rateLimitMiddleware(apiLimiter));

app.use("/api/auth", rateLimitMiddleware(authLimiter), authRoutes);

app.use("/api/admin", rateLimitMiddleware(adminLimiter), adminRoutes);

app.use("/api/paystation", rateLimitMiddleware(paymentLimiter), paystationRoutes);

app.use("/api/public", rateLimitMiddleware(apiLimiter), publicRoutes);

app.use("/api/user", rateLimitMiddleware(apiLimiter), userRoutes);

app.get("/debug-ip", (req, res) => {
  res.json({
    ip: req.ip,
    ips: req.ips,
    headers: {
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "cf-connecting-ip": req.headers["cf-connecting-ip"]
    }
  });
});


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