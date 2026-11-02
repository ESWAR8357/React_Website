import { generateProject } from '../lib/generateProject.js'

export const maxDuration = 60

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: 'Use POST to generate a project.' }))
    return
  }

  await generateProject(request, response)
}
