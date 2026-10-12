import { handleApi } from './api.mjs'
export function nodeHandler(env) {
  return async (request, response) => {
    let body = ''
    try {
      if (request.body !== undefined) body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
      else for await (const chunk of request) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 32768) { response.statusCode = 413; response.end(JSON.stringify({ error: '内容过长。' })); return }
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value)
      const result = await handleApi(new Request('http://localhost' + request.url, { method: request.method, headers, ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body } : {}) }), env)
      response.statusCode = result.status
      result.headers.forEach((value, name) => response.setHeader(name, value))
      response.end(await result.text())
    } catch {
      response.statusCode = 500
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: '服务暂时不可用，请稍后重试。' }))
    }
  }
}
