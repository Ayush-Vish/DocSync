import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MediaBucket } from "../src/platform.ts";

export function fileMediaBucket(directory: string): MediaBucket {
  const root = resolve(directory);
  const path = (key: string) => {
    const file = resolve(root, key);
    if (!file.startsWith(root + "/")) throw new Error("Invalid media key");
    return file;
  };
  return {
    async put(key, bytes) { const file = path(key); await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes); },
    async get(key, options) {
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await readFile(path(key))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
      const size = bytes.byteLength;
      if (options?.range) bytes = bytes.subarray(options.range.offset, options.range.offset + options.range.length);
      return { size, body: new Response(bytes.slice().buffer).body! };
    },
    async delete(key) { try { await unlink(path(key)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } },
  };
}
