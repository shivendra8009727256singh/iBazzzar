// Server-side API access for Server Components. Forwards the visitor's cookie so signed-in pages render correctly.
import { cookies } from 'next/headers';

const API = process.env.API_ORIGIN || 'http://127.0.0.1:4000';

export async function serverApi<T>(path: string, { auth = false, revalidate }: { auth?: boolean; revalidate?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  // Identifies this server to the API so page renders aren't rate-limited as if they were one visitor.
  if (process.env.INTERNAL_API_KEY) headers['x-internal-key'] = process.env.INTERNAL_API_KEY;
  if (auth) {
    const jar = await cookies();
    const session = jar.get('ib_session');
    if (session) headers.cookie = `ib_session=${session.value}`;
  }
  const res = await fetch(`${API}/api${path}`, {
    headers,
    ...(revalidate !== undefined && !auth ? { next: { revalidate } } : { cache: 'no-store' as const }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `API ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export async function tryServerApi<T>(path: string, opts?: { auth?: boolean; revalidate?: number }): Promise<T | null> {
  try { return await serverApi<T>(path, opts); } catch { return null; }
}
