# React Studio

React Studio is a web interface for asking Ollama to generate React website source files. It previews the generated files and packages them as a standalone Vite project ZIP.

## Run React Studio locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

1. Open a terminal in this `ai-react-builder` folder (the folder containing `package.json`).
2. Install dependencies:

   ```powershell
   npm install
   ```

3. Start the development app and its local API:

   ```powershell
   npm run dev
   ```

4. Open the localhost URL printed by Vite.

## Generate a website

### Create your Ollama API key

1. Open [Ollama API keys](https://ollama.com/settings/keys) and sign in to your Ollama account.
2. Select the option to create a new API key and copy it. Treat it like a password; do not share it or paste it into source code.
3. If you cannot use a model or receive a usage/billing error, check your Ollama account's model access, plan, and usage settings. Model availability and included usage can change.
4. If a key is exposed, revoke it from the same API keys page and create a replacement.

### Generate and download

1. Open React Studio over HTTPS if it is deployed publicly. For local use, run it at the localhost URL from `npm run dev`.
2. Paste your Ollama key into **Ollama API key**. The app keeps it in page memory for the current page and sends it through the React Studio server to Ollama. It does not intentionally save the key in browser storage. Only enter your key on a server you trust.
3. Describe the React frontend you want. Mention the pages, content, interactions, and visual style. Use an example button if you need a starting point.
4. Select **Generate my website** and wait for Ollama. The app shows an API error or validation error in the form if generation fails.
5. Inspect the returned files in **Generated source**. Select a filename tab to view it; use **Copy code** if needed.
6. Select **Download ZIP**. The ZIP is a separate, ready-to-run Vite + React project containing Ollama's generated source, React entry/setup files, Tailwind configuration, `package.json`, and run instructions.

React Studio previews and packages the generated source; it does **not** write generated files into React Studio's own `src/` folder, run or test the generated app for you, or deploy it. Ollama generates frontend code only. Unless you add and configure a real backend, features such as accounts, database storage, inventory, and payments are demonstrations, not production services. Review generated code before running or publishing it.

The **Dark mode / Light mode** button in the header changes the builder's appearance. It does not change the generated website's theme.

## Run a downloaded website ZIP

The ZIP contains generated `src/` files plus a Vite/React entry point, Tailwind setup, `package.json`, and its own README. It is a separate project from React Studio.

1. Extract the ZIP.
2. Open a terminal in the extracted folder—the folder that contains the ZIP's `package.json`.
3. Install dependencies once:

   ```powershell
   npm install
   ```

4. Start the website:

   ```powershell
   npm run dev
   ```

5. Open the localhost URL printed by Vite, usually `http://localhost:5173`.

If `npm install` reports that it cannot find `package.json`, the terminal is in the wrong folder or the ZIP was not extracted. Use `Get-ChildItem -Recurse -Filter package.json` to locate the project folder, then run npm from that folder.

For a production build of the generated site, run `npm run build`. Vite creates a `dist/` folder that can be deployed to static hosting.

## Deploy React Studio

React Studio itself requires a Node.js host because the Ollama key is sent to its server, which forwards it to Ollama. Static-only hosting is not sufficient. Use HTTPS for any public deployment.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Configure the host to provide its assigned `PORT`.

Each user enters their own Ollama key. Do not put a shared API key in frontend code or commit one to this project.

Optional server environment variables:

- `PORT`: listening port (defaults to `3000` in production)
- `OLLAMA_MODEL`: model name (defaults to `gemma4:31b-cloud`)
- `OLLAMA_API_URL`: chat API URL (defaults to `https://ollama.com/api/chat`)

## Limitations

Ollama generates frontend source code; it does not deploy the generated site or provide a production backend, database, authentication, inventory, or real payment processing. Review generated code before running or publishing it.
