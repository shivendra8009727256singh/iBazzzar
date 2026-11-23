// Browser-side API client. Requests go to /api on the same origin (Next rewrites them to the API server),
// so the session cookie is first-party and the API's Origin check passes.
export class ApiError extends Error {
  constructor(message: string, public status = 0, public fields: Record<string, unknown> = {}) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; idempotencyKey?: string };

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { body, idempotencyKey, headers, ...rest } = options;
  const isRaw = body instanceof Blob || body instanceof ArrayBuffer;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      method: rest.method ?? (body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(body !== undefined && !isRaw ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('We couldn’t reach IBazzzar. Please check your internet connection and try again.');
  }
  if (response.headers.get('content-type')?.includes('text/csv')) return (await response.text()) as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      data?.error || (response.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : 'Something went wrong. Please try again.'),
      response.status,
      data?.fields || {},
    );
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}, opts: Options = {}) => api<T>(path, { ...opts, method: 'POST', body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export async function upload<T = unknown>(path: string, file: File, extraHeaders: Record<string, string> = {}) {
  return api<T>(path, { method: 'POST', body: file, headers: { 'Content-Type': file.type, ...extraHeaders } });
}

export const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
