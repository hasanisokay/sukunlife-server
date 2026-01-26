import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

const getFolderFromMime = (mimetype) => {
  if (mimetype.startsWith("video/")) return "videos";
  if (mimetype === "application/pdf") return "pdfs";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("image/")) return "images";
  return "files";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = getFolderFromMime(file.mimetype);
    cb(null, `/data/uploads/private/${folder}`);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

export const uploadPrivateFile = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB
  },
});
