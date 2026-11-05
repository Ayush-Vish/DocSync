export type Session = { authenticated?: boolean; email: string; legacy: boolean };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function requestJson<T = any>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const text = await response.text();
    let value: any;
    try { value = JSON.parse(text); }
    catch { throw new ApiError(response.status, "The server returned an unreadable response. Your draft is still open; check the saved version before repeating a change."); }
    if (!response.ok) throw new ApiError(response.status, typeof value?.error === "string" ? value.error : `Request failed (${response.status}). Please try again.`);
    return value as T;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    const reason = timeout.aborted ? "The request took too long." : "The connection was interrupted.";
    throw new ApiError(0, `${reason} ${["GET", "HEAD"].includes(method) ? "Check your connection and try again." : "Your change may have reached the server. Keep your draft and check the saved version before trying again."}`);
  }
}

export const api = <T = any>(path: string, method = "GET", body?: unknown, signal?: AbortSignal) =>
  requestJson<T>("/api" + path, method, body, signal);
