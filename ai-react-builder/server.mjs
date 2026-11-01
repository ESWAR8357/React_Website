import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.join(projectRoot, 'dist')
const apiOnly = process.argv.includes('--api-only')
const port = Number(process.env.PORT || (apiOnly ? 3001 : 3000))
const model = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud'
const ollamaApiUrl = process.env.OLLAMA_API_URL || 'https://ollama.com/api/chat'
const maxRequestBytes = 512 * 1024
const maxFiles = 30
const maxFileBytes = 250 * 1024
const maxTotalBytes = 2 * 1024 * 1024
const allowedExtensions = new Set(['.css', '.js', '.jsx', '.svg'])

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

async function readJsonBody(request) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > maxRequestBytes) {
      throw new Error('Request is too large. Reduce the prompt size and try again.')
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function validateGeneratedFiles(generated) {
  const files = generated?.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('The model response did not contain a files object.')
  }

  const entries = Object.entries(files)
  if (entries.length < 3 || entries.length > maxFiles || !files['src/App.jsx']) {
    throw new Error('The model must return src/App.jsx and at least two other files.')
  }

  let totalBytes = 0
  const validatedFiles = {}
  for (const [fileName, content] of entries) {
    if (typeof content !== 'string') {
      throw new Error(`The generated content for ${fileName} is not text.`)
    }

    const segments = fileName.split('/')
    if (
      !fileName.startsWith('src/')
      || fileName === 'src/main.jsx'
      || fileName === 'src/index.css'
      || fileName.includes('\\')
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))
      || !allowedExtensions.has(path.posix.extname(fileName).toLowerCase())
    ) {
      throw new Error(`Rejected generated path "${fileName}". Files must be source files under src/.`)
    }

    const contentBytes = Buffer.byteLength(content, 'utf8')
    if (contentBytes > maxFileBytes) {
      throw new Error(`Generated file "${fileName}" is too large.`)
    }
    totalBytes += contentBytes
    if (totalBytes > maxTotalBytes) {
      throw new Error('The generated project is too large to return.')
    }
    validatedFiles[fileName] = content
  }

  return validatedFiles
}

async function generateProject(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    sendJson(response, 400, { error: error.message })
    return
  }

  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!apiKey || apiKey.length > 500) {
    sendJson(response, 400, { error: 'Enter a valid Ollama API key.' })
    return
  }
  if (!prompt || prompt.length > 12000) {
    sendJson(response, 400, { error: 'Enter a description between 1 and 12,000 characters.' })
    return
  }

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 180_000)

  try {
    const upstreamResponse = await fetch(ollamaApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        format: 'json',
        stream: false,
        messages: [
          {
            role: 'system',
            content: `Generate a complete React website project as multiple source files.
Return a JSON object with exactly this shape:
{"files":{"src/App.jsx":"complete file contents","src/components/Example.jsx":"complete file contents","src/styles.css":"complete file contents"}}
Return at least three files, including src/App.jsx, at least two additional modules imported by App.jsx, and at least one child React component rendered by App. Use only React, browser APIs, and CSS. Do not use any third-party packages, icon libraries, external APIs, backends, or payment processing. Ensure imports and relative file paths resolve. Use Tailwind CSS v4 utility classes where helpful; Tailwind is configured in the project. Every returned path must be a source file under src/. Do not return src/main.jsx or src/index.css; the downloaded project provides those files. Do not include markdown fences or text outside the JSON object.`,
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: abortController.signal,
    })

    let result
    try {
      result = await upstreamResponse.json()
    } catch {
      sendJson(response, 502, { error: 'Ollama returned a response that was not valid JSON.' })
      return
    }

    if (!upstreamResponse.ok) {
      const detail = typeof result?.error === 'string' ? `: ${result.error}` : ''
      sendJson(response, upstreamResponse.status, {
        error: `Ollama API error (HTTP ${upstreamResponse.status})${detail}`,
      })
      return
    }

    const content = result?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      sendJson(response, 502, { error: 'Ollama returned no generated files.' })
      return
    }

    let generated
    try {
      generated = JSON.parse(content)
    } catch {
      sendJson(response, 502, { error: 'Ollama did not return valid JSON for the generated files.' })
      return
    }

    let files
    try {
      files = validateGeneratedFiles(generated)
    } catch (error) {
      sendJson(response, 502, { error: error.message })
      return
    }

    sendJson(response, 200, { files })
  } catch (error) {
    const isTimeout = error?.name === 'AbortError'
    sendJson(response, isTimeout ? 504 : 502, {
      error: isTimeout
        ? 'Generation timed out. Try a shorter prompt and try again.'
        : 'Could not reach Ollama. Check the connection and try again.',
    })
  } finally {
    clearTimeout(timeout)
  }
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
