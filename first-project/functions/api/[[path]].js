const BACKEND = 'http://43.201.30.167:8080';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const targetUrl = BACKEND + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete('host');

  const backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  });

  const responseHeaders = new Headers(backendResponse.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}
