import type { GameActivity } from '@/lib/halo-store'

export const rehabGames = [
  { id: 1, title: 'Caution Alarm Response', domain: 'Reflex & Reaction' },
  { id: 2, title: 'Cabin Leak Sealing', domain: 'Reflex & Reaction' },
  { id: 3, title: 'Solar Flare Response', domain: 'Reflex & Reaction' },
  { id: 4, title: 'Thruster Cutoff Timing', domain: 'Reflex & Reaction' },
  { id: 5, title: 'Airlock Direction Match', domain: 'Reflex & Reaction' },
  { id: 6, title: 'Supply Capsule Catch', domain: 'Motor & Coordination' },
  { id: 7, title: 'Debris Field Weaving', domain: 'Motor & Coordination' },
  { id: 8, title: 'Robotic Arm Tracking', domain: 'Motor & Coordination' },
  { id: 9, title: 'Lander Hover Balance', domain: 'Motor & Coordination' },
  { id: 10, title: 'Conduit Path Trace', domain: 'Motor & Coordination' },
  { id: 11, title: 'Horizon Levelling', domain: 'Spatial Orientation' },
  { id: 12, title: 'Mental Rotation Match', domain: 'Spatial Orientation' },
  { id: 13, title: 'Docking Angle Estimation', domain: 'Spatial Orientation' },
  { id: 14, title: 'Inverted Control Adaptation', domain: 'Spatial Orientation' },
  { id: 15, title: 'Star Grid Plotting', domain: 'Spatial Orientation' },
  { id: 16, title: 'Radar Signal Watch', domain: 'Vigilance & Memory' },
  { id: 17, title: 'Telemetry Anomaly Scan', domain: 'Vigilance & Memory' },
  { id: 18, title: 'Keypad Sequence Recall', domain: 'Vigilance & Memory' },
  { id: 19, title: 'Circuit Grid Memory', domain: 'Vigilance & Memory' },
  { id: 20, title: 'Orbital Beacon N-Back', domain: 'Vigilance & Memory' },
  { id: 21, title: 'Dual-Task Docking', domain: 'Divided Attention & Ethics' },
  { id: 22, title: 'Life Support Balancing', domain: 'Divided Attention & Ethics' },
  { id: 23, title: 'Colour-Word Override', domain: 'Divided Attention & Ethics' },
  { id: 24, title: 'Crew Judgment Scenarios', domain: 'Divided Attention & Ethics' },
  { id: 25, title: 'Flight Director Protocol', domain: 'Divided Attention & Ethics' },
] as const

export type RehabGame = (typeof rehabGames)[number]

export type RecommendedPractice = RehabGame & {
  href: string
  reason: string
  averageScore: number | null
  recordedRuns: number
}

export function recommendPracticeGames(
  activities: Pick<GameActivity, 'gameId' | 'metrics'>[],
  limit = 3,
): RecommendedPractice[] {
  const scoredGames = new Map<number, number[]>()
  for (const activity of activities) {
    const match = /^rehabilitation-(\d+)$/.exec(activity.gameId)
    const id = match ? Number(match[1]) : 0
    const score = typeof activity.metrics.scoreOutOf10 === 'number'
      ? activity.metrics.scoreOutOf10
      : typeof activity.metrics.finalScore === 'number'
        ? activity.metrics.finalScore / 10
        : null
    if (!rehabGames.some(game => game.id === id) || score === null || score < 0 || score > 10) continue
    scoredGames.set(id, [...(scoredGames.get(id) ?? []), score])
  }

  const scored = [...scoredGames.entries()]
    .map(([id, scores]) => ({ id, scores, average: scores.reduce((sum, score) => sum + score, 0) / scores.length }))
    .sort((a, b) => a.average - b.average || a.id - b.id)
  const selected: { game: RehabGame; average: number | null; recordedRuns: number }[] = scored.slice(0, limit).flatMap(({ id, scores, average }) => {
    const game = rehabGames.find(item => item.id === id)
    return game ? [{ game, average, recordedRuns: scores.length }] : []
  })
  const selectedIds = new Set(selected.map(item => item.game.id))
  const unscored = rehabGames.filter(game => !scoredGames.has(game.id))
  const remaining = Math.max(0, limit - selectedIds.size)
  selected.push(...unscored.slice(0, remaining).map(game => ({ game, average: null, recordedRuns: 0 })))

  return selected.map(({ game, average, recordedRuns }) => ({
    ...game,
    href: `/rehabilitation?exercise=${game.id}`,
    averageScore: average === null ? null : Number(average.toFixed(1)),
    recordedRuns,
    reason: average === null
      ? 'Starter option; no score for this game was recorded in the recent window.'
      : `One of the lower recorded averages in the recent window: ${average.toFixed(1)}/10 across ${recordedRuns} ${recordedRuns === 1 ? 'run' : 'runs'}.`,
  }))
}

export function recommendPracticeGame(activities: Pick<GameActivity, 'gameId' | 'metrics'>[]): RecommendedPractice {
  return recommendPracticeGames(activities)[0]
}
