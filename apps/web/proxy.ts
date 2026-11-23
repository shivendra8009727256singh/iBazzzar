import { NextResponse, type NextRequest } from 'next/server';

// Forwards /api/* to the IBazzzar API on the same origin, so session cookies stay first-party.
// API_ORIGIN is read at request time, so the same build can be deployed against any API address.
export function proxy(request: NextRequest) {
  const api = process.env.API_ORIGIN || 'http://127.0.0.1:4000';
  return NextResponse.rewrite(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, api));
}

export const config = { matcher: '/api/:path*' };
