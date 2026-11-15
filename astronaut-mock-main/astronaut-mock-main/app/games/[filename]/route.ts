import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { routeMissionSoundtrack } from '@/lib/mission-soundtrack-html'

const gameFiles = new Map<string, () => Promise<string>>([
  ['quick_reaction_test.html', () => readFile(resolve(process.cwd(), '..', '..', 'quick_reaction_test.html'), 'utf8')],
  ['orbital_supply_catch.html', () => readFile(resolve(process.cwd(), '..', '..', 'orbital_supply_catch.html'), 'utf8')],
  ['dual_task_docking.html', () => readFile(resolve(process.cwd(), '..', '..', 'dual_task_docking.html'), 'utf8')],
])

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  const loadGame = gameFiles.get(filename)
  if (!loadGame) return new Response('Game not found.', { status: 404 })

  const html = routeMissionSoundtrack(await loadGame())
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
