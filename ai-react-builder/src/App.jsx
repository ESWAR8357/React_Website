import { useMemo, useState } from 'react'
import { createProjectZip } from './createProjectZip.js'
import projectPackage from '../package.json'

const examples = [
  'A warm, minimal bakery website with a menu and opening hours',
  'A modern portfolio for a freelance photographer',
  'A clothing store with product filters and a shopping cart',
]

function SparkIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"
      />
      <path strokeLinecap="round" d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
    </svg>
  )
}

function App() {
  const [theme, setTheme] = useState(
    () => window.localStorage.getItem('react-studio-theme') || 'light',
  )
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const fileNames = useMemo(() => (files ? Object.keys(files) : []), [files])

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light'
      window.localStorage.setItem('react-studio-theme', nextTheme)
      return nextTheme
    })
  }

  async function handleGenerate(event) {
    event.preventDefault()
    setError('')
    setFiles(null)
    setSelectedFile('')
    setCopied(false)
    setIsGenerating(true)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, prompt }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Generation failed (HTTP ${response.status}).`)
      }

      setFiles(result.files)
      setSelectedFile(Object.keys(result.files)[0] || '')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Something went wrong.')
    } finally {
      setIsGenerating(false)
    }
  }

  function downloadZip() {
    if (!files) return
    const blob = new Blob([createProjectZip(files, projectPackage)], {
      type: 'application/zip',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'react-website-source.zip'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copySelectedFile() {
    if (!files || !selectedFile) return
    try {
      await navigator.clipboard.writeText(files[selectedFile])
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Could not access the clipboard. Select and copy the code instead.')
    }
  }

  return (
    <div id="studio-app" data-theme={theme} className="studio-app min-h-screen">
      <header className="studio-header relative border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="#" className="flex items-center gap-3" aria-label="React Studio home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-stone-700 text-white">
              <SparkIcon />
            </span>
            <span className="text-lg font-semibold tracking-tight">React Studio</span>
          </a>
          <div className="flex items-center gap-3">
            <div className="studio-chip flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-stone-500" />
              Powered by Ollama
            </div>
            <button
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="studio-theme-toggle rounded-xl border px-3 py-2 text-xs font-medium transition hover:opacity-75"
              onClick={toggleTheme}
              type="button"
            >
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div className="mb-10 max-w-3xl">
          <div className="studio-chip mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
            YOUR IDEA, BUILT WITH REACT
          </div>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl">
            Describe it.
            <span className="block text-stone-500">
              Make it real.
            </span>
          </h1>
          <p className="studio-muted mt-5 max-w-2xl text-base leading-7 sm:text-lg">
            Describe a React website in plain language. Generate its source files, inspect them,
            and download a project you can install and run.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)]">
          <section className="studio-panel rounded-3xl border p-5 sm:p-7">
            <div className="mb-6">
              <p className="studio-muted text-xs font-semibold uppercase tracking-[0.18em]">01 / Configure</p>
              <h2 className="mt-2 text-xl font-semibold">Start with your idea</h2>
            </div>

            <form onSubmit={handleGenerate} className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="api-key" className="text-sm font-medium">
                    Ollama API key
                  </label>
                  <a
                    className="studio-muted text-xs underline underline-offset-2 hover:opacity-75"
                    href="https://ollama.com/settings/keys"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Create a key ↗
                  </a>
                </div>
                <div className="studio-field flex rounded-xl border transition focus-within:ring-2">
                  <input
                    id="api-key"
                    autoComplete="off"
                    className="studio-key-input min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm outline-none"
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Paste your key"
                    required
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                  />
                  <button
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="studio-muted px-4 text-xs font-medium transition hover:opacity-75"
                    onClick={() => setShowApiKey((visible) => !visible)}
                    type="button"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="studio-muted mt-2 text-xs leading-5">
                  Sign in to Ollama, create a key, then paste it here. The app forwards it to
                  Ollama to generate your site; it is not saved in browser storage. Usage limits
                  and charges depend on your Ollama account and selected model.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="website-prompt" className="text-sm font-medium">
                    Describe your React website
                  </label>
                  <span className="studio-muted text-xs">{prompt.length}/12000</span>
                </div>
                <textarea
                  id="website-prompt"
                  className="studio-field min-h-44 w-full resize-y rounded-xl border px-4 py-3.5 text-sm leading-6 outline-none transition focus:ring-2"
                  maxLength={12000}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: Build a responsive coffee shop website with a menu, opening hours, and a warm, earthy design..."
                  required
                  value={prompt}
                />
                <p className="studio-muted mt-2 text-xs leading-5">
                  Ollama returns React source files. This app previews them and puts them in a
                  downloadable ZIP; it does not write them into the builder or deploy the site.
                </p>
              </div>

              <div>
                <p className="studio-muted mb-2 text-xs font-medium">Need inspiration? Choose an example to fill the prompt.</p>
                <div className="flex flex-wrap gap-2">
                  {examples.map((example) => (
                    <button
                      className="studio-example rounded-full border px-3 py-1.5 text-left text-xs transition"
                      key={example}
                      onClick={() => setPrompt(example)}
                      type="button"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-300/20 bg-rose-400/[0.07] px-4 py-3 text-sm leading-6 text-rose-200" role="alert">
                  {error}
                </div>
              )}

              <button
                className="studio-generate flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isGenerating}
                type="submit"
              >
                {isGenerating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    Building your React files...
                  </>
                ) : (
                  <>
                    <SparkIcon className="h-4 w-4" />
                    Generate my website
                  </>
                )}
              </button>
            </form>
          </section>

          <section className="studio-panel flex min-h-[620px] flex-col overflow-hidden rounded-3xl border">
            <div className="studio-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
              <div>
                <p className="studio-muted text-xs font-semibold uppercase tracking-[0.18em]">02 / Your project</p>
                <h2 className="mt-1 text-base font-semibold">Generated source</h2>
              </div>
              {files && (
                <button
                  className="studio-secondary rounded-lg border px-3.5 py-2 text-xs font-semibold transition"
                  onClick={downloadZip}
                  type="button"
                >
                  Download ZIP
                </button>
              )}
            </div>

            {!files ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <div className="studio-chip mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border">
                    <SparkIcon className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-semibold">Your project starts here</h3>
                  <p className="studio-muted mt-2 text-sm leading-6">
                    Enter an Ollama key and describe your React site. Ollama generates frontend
                    files; review them here, then download the runnable project ZIP.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="studio-divider flex items-center gap-2 overflow-x-auto border-b px-4 py-3">
                  {fileNames.map((fileName) => (
                    <button
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${
                        selectedFile === fileName
                          ? 'studio-file-active'
                          : 'studio-file-tab'
                      }`}
                      key={fileName}
                      onClick={() => setSelectedFile(fileName)}
                      type="button"
                    >
                      {fileName}
                    </button>
                  ))}
                </div>
                <div className="studio-divider flex items-center justify-between border-b px-5 py-3">
                  <span className="studio-muted truncate font-mono text-xs">{selectedFile}</span>
                  <button
                    className="studio-muted ml-3 shrink-0 text-xs font-medium transition hover:opacity-75"
                    onClick={copySelectedFile}
                    type="button"
                  >
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                </div>
                <pre className="studio-code min-h-0 flex-1 overflow-auto p-5 text-xs leading-6 sm:text-[13px]">
                  <code>{files[selectedFile]}</code>
                </pre>
                <div className="studio-divider studio-muted border-t px-5 py-3 text-xs leading-5">
                  The ZIP includes a ready-to-run Vite project. Extract it, run <code className="text-slate-300">npm install</code>, then <code className="text-slate-300">npm run dev</code>. See its README for details.
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="studio-panel mt-8 rounded-3xl border p-5 sm:p-7">
          <p className="studio-muted text-xs font-semibold uppercase tracking-[0.18em]">03 / Run your website</p>
          <h2 className="mt-2 text-xl font-semibold">From downloaded ZIP to running React app</h2>
          <ol className="studio-muted mt-4 grid gap-3 text-sm leading-6 sm:grid-cols-3">
            <li><span className="font-semibold text-stone-500">1.</span> Download and extract the ZIP. Open a terminal in the extracted folder (the one containing package.json).</li>
            <li><span className="font-semibold text-stone-500">2.</span> Run <code className="studio-inline-code">npm install</code> once to install React, Vite, and Tailwind.</li>
            <li><span className="font-semibold text-stone-500">3.</span> Run <code className="studio-inline-code">npm run dev</code>, then open the localhost URL Vite prints.</li>
          </ol>
          <p className="studio-muted mt-4 text-xs leading-5">
            For a production build, run <code className="studio-inline-code">npm run build</code>; deploy the resulting <code className="studio-inline-code">dist</code> folder to a static host. This generated website is separate from the builder.
          </p>
        </section>

        <footer className="studio-muted mt-8 flex flex-col gap-2 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between">
          <span>Your API key is forwarded to Ollama to fulfill your request. Use this tool only on a trusted HTTPS site.</span>
          <span>Review generated code before publishing.</span>
        </footer>
      </main>
    </div>
  )
}

export default App
