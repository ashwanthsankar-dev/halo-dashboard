import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { routeMissionSoundtrack } from '@/lib/mission-soundtrack-html'

export async function GET() {
  const pagePath = resolve(process.cwd(), '..', '..', 'halo_rehabilitation_portal.html')
  const html = routeMissionSoundtrack(await readFile(pagePath, 'utf8'))
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
