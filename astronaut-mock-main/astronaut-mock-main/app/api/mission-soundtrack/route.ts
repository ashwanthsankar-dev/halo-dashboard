import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function GET() {
  const scriptPath = resolve(process.cwd(), '..', '..', 'mission-soundtrack.js')
  const script = await readFile(scriptPath, 'utf8')
  return new Response(script, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/javascript; charset=utf-8',
    },
  })
}
