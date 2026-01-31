import mime from "mime-types";

export const getMimeTypeForHeader = (filename, storedMime = null) => {
  const detectedMime = mime.lookup(filename);

  if (detectedMime) {
    return detectedMime;
  }
  const ext = getExtension(filename);
  return getMimeTypeByExtension(ext) || "application/octet-stream";
};

const getExtension = (filename) => {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
};

const getMimeTypeByExtension = (extension) => {
  const customMappings = {
    ".exe": "application/x-msdownload",
    ".msi": "application/x-msdownload",
    ".dmg": "application/x-apple-diskimage",
    ".apk": "application/vnd.android.package-archive",
    ".iso": "application/x-iso9660-image",
    ".flv": "video/x-flv",
    ".swf": "application/x-shockwave-flash",
    ".psd": "image/vnd.adobe.photoshop",
    ".ai": "application/postscript",
    ".eps": "application/postscript",
    ".ps": "application/postscript",
    ".torrent": "application/x-bittorrent",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".eot": "application/vnd.ms-fontobject",
    ".svgz": "image/svg+xml",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".avif": "image/avif",
  };

  // Check custom mappings first
  if (customMappings[extension]) {
    return customMappings[extension];
  }

  // Use mime-types for everything else
  return mime.lookup(extension);
};

export const shouldDisplayInline = (mimeType) => {
  if (!mimeType) return false;

  const inlineTypes = [
    "image",
    "video",
    "audio",
    "text",
    "application/pdf",
    "application/json",
    "application/xml",
    "application/javascript",
    "font",
  ];

  return inlineTypes.some((type) => mimeType.includes(type));
};
export const getContentDisposition = (filename, mimeType) => {
  const safeFilename = encodeURIComponent(filename);

  if (shouldDisplayInline(mimeType)) {
    return `inline; filename="${safeFilename}"`;
  }

  return `attachment; filename="${safeFilename}"`;
};
