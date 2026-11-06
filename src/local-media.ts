// Node-only stdio adapter. Hosted MCP is never given this capability.
import { open } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { maxMediaBytes } from "./media-config.ts";

export async function readMediaFile(path: string) {
  if (!isAbsolute(path)) throw new Error("filePath must be an absolute local path");
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxMediaBytes) throw new Error("Choose a regular media file of 1 byte to 8 MiB");
    const bytes = new Uint8Array(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const part = await file.read(bytes, length, bytes.length - length, length);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length !== info.size) throw new Error("The media file changed while reading; try again after it finishes writing");
    return { bytes: bytes.subarray(0, length), filename: basename(path) };
  } finally { await file.close(); }
}
