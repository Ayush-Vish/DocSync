import { open } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };
const maxBytes = 8 * 1024 * 1024;

// Returns the hosted upload_media fields; no network request or document edit.
export async function mediaToBase64(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("Provide a local media file path.");
  const mimeType = mimeTypes[extname(filePath).toLowerCase()];
  if (!mimeType) throw new Error("Use a PNG, JPEG, GIF, WebP, MP4 or WebM file.");
  const file = await open(filePath, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes) throw new Error("Choose a regular media file of 1 byte to 8 MiB.");
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== info.size) throw new Error("The media file changed while reading. Wait for it to finish writing.");
    return { filename: basename(filePath), mimeType, dataBase64: bytes.subarray(0, length).toString("base64") };
  } finally { await file.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [filePath, ...extra] = process.argv.slice(2);
  try {
    if (!filePath || extra.length) throw new Error("Usage: node media-to-base64.mjs /path/to/image.png > media.json");
    process.stdout.write(JSON.stringify(await mediaToBase64(filePath)) + "\n");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
