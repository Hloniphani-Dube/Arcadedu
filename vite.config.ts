import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Dev-only stand-in for Vercel's Serverless Functions runtime. `vite dev`
 * only serves the SPA, so without this, none of api/*.ts is reachable
 * locally and every AI/agent call 404s. This loads the real handler modules
 * unmodified (via Vite's own SSR module loader) and adapts the Node
 * request/response to the minimal Vercel-style interface each one expects.
 * Production still runs on actual Vercel Functions; this plugin is
 * `apply: 'serve'` only and never touches the build output.
 */
function localApiFunctions(): Plugin {
  const routes: Record<string, string> = {
    '/api/ai': '/api/ai.ts',
    '/api/agent/tick': '/api/agent/tick.ts',
  }

  async function readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  return {
    name: 'local-api-functions',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      for (const [route, modulePath] of Object.entries(routes)) {
        server.middlewares.use(route, async (req: IncomingMessage, res: ServerResponse, next) => {
          if (req.url !== '/' && req.url !== '') return next()
          try {
            const mod = await server.ssrLoadModule(modulePath)
            const body = req.method === 'POST' ? await readBody(req) : undefined
            const vercelReq = { method: req.method, body, headers: req.headers }
            const vercelRes = {
              status(code: number) {
                res.statusCode = code
                return vercelRes
              },
              json(payload: unknown) {
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify(payload))
              },
              setHeader(name: string, value: string) {
                res.setHeader(name, value)
              },
              end(payload?: string) {
                res.end(payload)
              },
            }
            await mod.default(vercelReq, vercelRes)
          } catch (err) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'dev shim failed' }))
          }
        })
      }

      // api/agent/decide.py (Strands + Bedrock) is a Python runtime function —
      // there is no Python available in this local dev environment. Rather
      // than fabricate a decision, this honestly reports the agent as
      // unavailable, which is the exact same recoverable path the real
      // function takes when AWS/Bedrock credentials are missing or invalid.
      server.middlewares.use('/api/agent/decide', (_req, res) => {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            error:
              'agent failed: Bedrock/Strands is not available in local dev (no Python runtime / AWS credentials here)',
          }),
        )
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localApiFunctions()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
