import { strToU8, zipSync } from 'fflate'

export function createProjectZip(files, projectPackage) {
  const zipContents = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, strToU8(content)]),
  )
  const packageFile = {
    name: 'generated-react-website',
    private: true,
    version: '1.0.0',
    type: 'module',
    engines: projectPackage.engines,
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: projectPackage.dependencies.react,
      'react-dom': projectPackage.dependencies['react-dom'],
    },
    devDependencies: {
      '@tailwindcss/vite': projectPackage.devDependencies['@tailwindcss/vite'],
      '@vitejs/plugin-react': projectPackage.devDependencies['@vitejs/plugin-react'],
      tailwindcss: projectPackage.devDependencies.tailwindcss,
      vite: projectPackage.devDependencies.vite,
    },
  }
  const setupFiles = {
    'package.json': JSON.stringify(packageFile, null, 2),
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f8fafc" />
    <title>Generated React Website</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    'vite.config.js': `import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
`,
    'src/main.jsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
    'src/index.css': `@import "tailwindcss";

:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}
`,
    'README.md': `# Generated React Website

## Run locally

Requirements: Node.js ${projectPackage.engines.node} and npm.

1. Extract this ZIP file to a folder.
2. Open a terminal in that extracted folder (the folder containing package.json).
3. Install the project dependencies:

\`\`\`sh
npm install
\`\`\`

4. Start the development server:

\`\`\`sh
npm run dev
\`\`\`

5. Open the local URL printed by Vite, usually http://localhost:5173.

To create a production build, run \`npm run build\`. Vite writes the deployable static site to the \`dist\` folder.

This is a React front-end project. Review the generated code before publishing. Any checkout, login, or data persistence in the generated UI is a demo unless you connect and configure a real backend service.
`,
  }

  for (const [name, content] of Object.entries(setupFiles)) {
    zipContents[name] = strToU8(content)
  }

  return zipSync(zipContents)
}
