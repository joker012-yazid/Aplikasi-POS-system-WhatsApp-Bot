import { NextRequest, NextResponse } from 'next/server';

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
]);

const normaliseBaseUrl = (value: string) => {
  const trimmed = value.replace(/\/$/, '');
  if (trimmed.endsWith('/api')) {
    return trimmed;
  }
  return `${trimmed}/api`;
};

const resolveBaseUrl = () => {
  const candidates = [process.env.API_BASE_URL, process.env.WA_API_BASE_URL, process.env.NEXT_PUBLIC_API_URL];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
      return candidate;
    }
  }
  return 'http://api:3000';
};

const rawBaseUrl = resolveBaseUrl();
const API_BASE_URL = normaliseBaseUrl(rawBaseUrl);

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const targetPath = pathSegments.join('/');
  const search = request.nextUrl.search;
  const targetUrl = `${API_BASE_URL}${targetPath ? `/${targetPath}` : ''}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  if (request.headers.get('host')) {
    headers.set('x-forwarded-host', request.headers.get('host')!);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    const body = await request.text();
    init.body = body;
  }

  const response = await fetch(targetUrl, init);

  const filteredHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return;
    }
    filteredHeaders.set(key, value);
  });

  const proxiedResponse = new NextResponse(response.body, {
    status: response.status,
    headers: filteredHeaders,
  });

  return proxiedResponse;
}

const handler = (request: NextRequest, context: { params: { path?: string[] } }) => {
  const pathSegments = context.params.path ?? [];
  return proxyRequest(request, pathSegments);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
