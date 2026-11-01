import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const apiPort = Number(process.env.API_PORT || 3001)
const apiServerPath = fileURLToPath(new URL('./server.mjs', import.meta.url))
const viteCliPath = fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url))
const api = spawn(process.execPath, [apiServerPath, '--api-only'], {
  env: { ...process.env, PORT: String(apiPort) },
  stdio: 'inherit',
})

let vite
let shuttingDown = false

function stopChildren(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (vite && vite.exitCode === null) vite.kill()
  if (api.exitCode === null) api.kill()
  process.exitCode = exitCode
}

function waitForApi() {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const tryConnect = () => {
      if (api.exitCode !== null) {
        reject(new Error('The generation API stopped before becoming available.'))
        return
      }

      const socket = net.createConnection({ host: '127.0.0.1', port: apiPort })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        attempts += 1
        if (attempts >= 40) {
          reject(new Error(`The generation API did not start on port ${apiPort}.`))
        } else {
          setTimeout(tryConnect, 250)
        }
      })
    }
    tryConnect()
  })
}

process.once('SIGINT', () => stopChildren())
process.once('SIGTERM', () => stopChildren())
api.once('error', (error) => {
  console.error('Could not start the generation API:', error.message)
  stopChildren(1)
})
api.once('exit', (code) => {
  if (!shuttingDown) {
    console.error('The generation API exited unexpectedly.')
    stopChildren(code || 1)
  }
})

try {
  await waitForApi()
  if (shuttingDown) process.exit(0)

  vite = spawn(process.execPath, [viteCliPath, '--host', '127.0.0.1'], {
    env: { ...process.env, API_PORT: String(apiPort) },
    stdio: 'inherit',
  })
  vite.once('error', (error) => {
    console.error('Could not start Vite:', error.message)
    stopChildren(1)
  })
  vite.once('exit', (code) => stopChildren(code || 0))
} catch (error) {
  console.error(error.message)
  stopChildren(1)
}
