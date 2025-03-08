import dotenv from "dotenv";
dotenv.config();
const isProduction = process.env.NODE_ENV === "production";
export const ACCESS_TOKEN_SECRET_KEY = process.env.JWT_SECRET;
export const REFRESH_SECRET_KEY = process.env.REFRESH_JWT_SECRET;

export const ACCESS_COOKIE_NAME = "acs_token";
export const REFRESH_COOKIE_NAME = "rfr_token";
export const ACCESS_EXPIRATION = "24h"; // Shorter expiration for access token
export const REFRESH_EXPIRATION = "30d"; // Longer expiration for refresh token
export const ACCESS_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; //10 hours
export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const DOMAIN =  '.vercel.app'