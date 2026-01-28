import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";
import fs from "fs";

const basePrivate = "/data/uploads/private";
const tmpDir = "/data/uploads/tmp";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const getFolderFromMime = (mimetype) => {
  if (mimetype.startsWith("video/")) return "tmp"; //  TEMP
  if (mimetype === "application/pdf") return "pdfs";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("image/")) return "images";
  return "files";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = getFolderFromMime(file.mimetype);
    cb(null, folder === "tmp" ? tmpDir : `${basePrivate}/${folder}`);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

export const uploadPrivateFile = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
  },
});
