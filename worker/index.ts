/**
 * Aether's edge worker. Serves the static app and a minimal same-origin
 * pass-through to OpenAI, whose API doesn't allow direct browser (CORS) calls.
 * The user's own key travels in the Authorization header and is never stored or logged.
 */
interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const OPENAI_ROUTES: Record<string, string> = {
  '/api/openai/v1/chat/completions': 'POST',
  '/api/openai/v1/models': 'GET',
}

async function proxyOpenAI(req: Request, url: URL): Promise<Response> {
  const method = OPENAI_ROUTES[url.pathname]
  if (!method || req.method !== method) return new Response('Not found', { status: 404 })
  // only this site may use the relay
  const origin = req.headers.get('Origin')
  if (origin && new URL(origin).host !== url.host) return new Response('Forbidden', { status: 403 })
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return new Response('Missing API key', { status: 401 })
  const headers = new Headers({ Authorization: auth })
  if (method === 'POST') headers.set('Content-Type', 'application/json')
  const upstream = await fetch(`https://api.openai.com${url.pathname.replace('/api/openai', '')}${url.search}`, {
    method,
    headers,
    body: method === 'POST' ? req.body : undefined,
  })
  const out = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' })
  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/openai/')) return proxyOpenAI(req, url)
    const res = await env.ASSETS.fetch(req)
    // A missing hashed asset must 404 — never fall back to index.html, which would be cached as
    // "immutable" under the asset's URL and break the page for that visitor until the next deploy.
    if (url.pathname.startsWith('/assets/') && (res.headers.get('Content-Type') ?? '').includes('text/html')) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    return res
  },
}
