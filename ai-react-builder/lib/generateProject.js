import { Buffer } from 'node:buffer'
import path from 'node:path'
import { env } from 'node:process'

const model = env.OLLAMA_MODEL || 'gemma4:31b-cloud'
const ollamaApiUrl = env.OLLAMA_API_URL || 'https://ollama.com/api/chat'
const maxRequestBytes = 512 * 1024
const maxFiles = 30
const maxFileBytes = 250 * 1024
const maxTotalBytes = 2 * 1024 * 1024
const allowedExtensions = new Set(['.css', '.js', '.jsx', '.svg'])

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request) {
  // Vercel's Node.js runtime parses JSON request bodies before invoking the
  // function. The local Node server receives the raw request stream instead.
  if (request.body !== undefined) {
    let body = request.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        throw new Error('Request body must be valid JSON.')
      }
    }
    if (Buffer.byteLength(JSON.stringify(body) ?? '', 'utf8') > maxRequestBytes) {
      throw new Error('Request is too large. Reduce the prompt size and try again.')
    }
    return body
  }

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
    if (contentBytes > maxFileBytes) throw new Error(`Generated file "${fileName}" is too large.`)
    totalBytes += contentBytes
    if (totalBytes > maxTotalBytes) throw new Error('The generated project is too large to return.')
    validatedFiles[fileName] = content
  }

  return validatedFiles
}

export async function generateProject(request, response) {
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
