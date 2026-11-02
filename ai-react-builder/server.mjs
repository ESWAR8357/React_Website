import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateProject } from './lib/generateProject.js'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.join(projectRoot, 'dist')
const apiOnly = process.argv.includes('--api-only')
const port = Number(process.env.PORT || (apiOnly ? 3001 : 3000))

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

async function serveStatic(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    sendJson(response, 400, { error: 'Invalid URL.' })
    return
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const filePath = path.resolve(distRoot, requestedPath)
  const relativePath = path.relative(distRoot, filePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendJson(response, 400, { error: 'Invalid path.' })
    return
  }

  let resolvedPath = filePath
  try {
    await access(resolvedPath)
    const fileStats = await stat(resolvedPath)
    if (!fileStats.isFile()) throw new Error('Not a file')
  } catch {
    if (path.extname(requestedPath)) {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    resolvedPath = path.join(distRoot, 'index.html')
  }

  try {
    const fileStats = await stat(resolvedPath)
    response.writeHead(200, {
      'Cache-Control': path.basename(resolvedPath) === 'index.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
      'Content-Length': fileStats.size,
      'Content-Type': mimeTypes[path.extname(resolvedPath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    if (request.method === 'HEAD') {
      response.end()
    } else {
      createReadStream(resolvedPath).pipe(response)
    }
  } catch {
    sendJson(response, 500, { error: 'Built website files are unavailable. Run npm run build first.' })
  }
}

if (!apiOnly) {
  try {
    await access(path.join(distRoot, 'index.html'))
  } catch {
    throw new Error('Production files are missing. Run "npm run build" before starting the server.')
  }
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/api/generate') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Use POST to generate a project.' })
      return
    }
    void generateProject(request, response)
    return
  }
  if (pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'API endpoint not found.' })
    return
  }
  if (apiOnly) {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }
  void serveStatic(request, response)
})

server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(apiOnly
    ? `Ollama generation API listening on port ${port}`
    : `React Studio listening on port ${port}`)
})
