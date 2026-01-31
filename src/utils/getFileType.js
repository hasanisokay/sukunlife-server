import mime from "mime-types";

export const getMimeTypeForHeader = (filename, storedMime = null) => {
  if (storedMime) return storedMime;

  const detectedMime = mime.lookup(filename);
  if (detectedMime) return detectedMime;

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

  if (customMappings[extension]) {
    return customMappings[extension];
  }

  return mime.lookup(extension.slice(1));
};

export const shouldDisplayInline = (mimeType) => {
  if (!mimeType) return false;

  const inlinePrefixes = [
    "image/",
    "video/",
    "audio/",
    "text/",
    "font/",
  ];

  const inlineExact = [
    "application/pdf",
    "application/json",
    "application/xml",
    "application/javascript",
  ];

  return (
    inlinePrefixes.some((p) => mimeType.startsWith(p)) ||
    inlineExact.includes(mimeType)
  );
};

export const getContentDisposition = (filename, mimeType) => {
  const encoded = encodeURIComponent(filename);

  if (shouldDisplayInline(mimeType)) {
    return `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`;
  }

  return `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`;
};
