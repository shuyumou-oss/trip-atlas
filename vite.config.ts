import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodeHandler } from './server/node-adapter.mjs'

function localApi(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'trip-atlas-api',
    configResolved(config) { env = loadEnv(config.mode, config.root, '') },
    configureServer(server) {
      server.middlewares.use((request: any, response, next) => {
        if (!request.url?.startsWith('/api/')) { next(); return }
        void nodeHandler(env)(request, response)
      })
    },
  }
}
export default defineConfig({ plugins: [react(), localApi()] })
