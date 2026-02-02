import dotenv from "dotenv";
dotenv.config();
const isProduction = process.env.NODE_ENV === "production";
export const ACCESS_TOKEN_SECRET_KEY = process.env.JWT_SECRET;
export const REFRESH_SECRET_KEY = process.env.REFRESH_JWT_SECRET;

export const ACCESS_COOKIE_NAME = "acs_token";
export const REFRESH_COOKIE_NAME = "rfr_token";

export const DOMAIN =  '.vercel.app'

// Token expirations (used for JWT signing)
export const ACCESS_EXPIRATION = "2h";   // 2 hours
export const REFRESH_EXPIRATION = "30d"; // 30 days

// Cookie maxAge (in milliseconds)
export const ACCESS_COOKIE_MAX_AGE = 2 * 60 * 60 * 1000;     // 2 hours
export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
