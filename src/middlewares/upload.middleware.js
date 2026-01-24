import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

const MAX_SIZES = {
  image: 50 * 1024 * 1024,   // 50MB
  audio: 200 * 1024 * 1024,  // 200MB
  video: 1000 * 1024 * 1024, // 1000MB
  pdf:   50 * 1024 * 1024,  // 50MB
};

const getTypeFromMime = (mimetype) => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype === "application/pdf") return "pdf";
  return null;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = getTypeFromMime(file.mimetype);
    let folder = "docs";

    if (type === "image") folder = "images";
    if (type === "audio") folder = "audio";
    if (type === "video") folder = "video";
    if (type === "pdf") folder = "docs";

    cb(null, `/data/uploads/public/${folder}`);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

export const uploadPublicFile = multer({
  storage,

  fileFilter: (req, file, cb) => {
    const type = getTypeFromMime(file.mimetype);
    if (!type) {
      return cb(new Error("File type not allowed"));
    }

    // attached type for later use
    file._fileType = type;
    cb(null, true);
  },

  limits: {
    fileSize: Math.max(
      MAX_SIZES.image,
      MAX_SIZES.audio,
      MAX_SIZES.video,
      MAX_SIZES.pdf
    ),
  },
});
