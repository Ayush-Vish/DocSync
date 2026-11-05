import { HttpError } from "./content.ts";

// Check the actual stream too: Content-Length can be absent or untrusted.
async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length")) > limit)
    throw new HttpError(413, "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function jsonBody(request: Request, limit = 550_000): Promise<Record<string, unknown>> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new HttpError(415, "JSON body required");
  const bytes = await readBody(request, limit);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, "Invalid JSON object"); }
}

export async function boundedRequest(request: Request, limit = 550_000) {
  return new Request(request, { body: await readBody(request, limit) });
}

export async function formBody(request: Request) {
  const type = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded" && type !== "multipart/form-data")
    throw new HttpError(415, "Form body required");
  const bounded = await boundedRequest(request, 16_384);
  try { return await bounded.formData(); }
  catch { throw new HttpError(400, "Invalid form body"); }
}
