import { rehabGames } from '@/lib/rehab-games'

export const HALO_STORAGE_KEY = 'halo.localDemoData.v1'

export type Provenance = 'synthetic-demo' | 'participant-entered' | 'external-nasa-osdr'
export type GameKind = 'signal-match' | 'orbital-supply-catch'
export type TaskOutcome = 'hit' | 'error' | 'omission'

export type CheckIn = {
  id: string
  recordedAt: string
  source: Provenance
  sleepHours: number | null
  stress: number | null
  currentWorkload: number | null
  restingHeartRate: number | null
  bloodPressureSystolic: number | null
  bloodPressureDiastolic: number | null
  rehabilitationPrecisionPercent: number | null
  rehabilitationReactionMs: number | null
  rehabilitationAttentionPercent: number | null
  dailyTlxRatings: TlxRatings | null
  notMeasuredFields?: string[]
  sourceDetail: string
  context: string
  notes: string
}

export type TaskTrial = {
  sessionId: string
  trialId: string
  source: Provenance
  stimulus: string
  expectedResponse: 'match' | 'no-match' | 'catch' | 'avoid'
  actualResponse: 'match' | 'no-match' | 'catch' | 'avoid' | null
  reactionTimeMs: number | null
  outcome: TaskOutcome
}

export type TaskSession = {
  id: string
  game: GameKind
  source: Provenance
  startedAt: string
  completedAt: string
  durationMs: number
  trials: TaskTrial[]
}

export type GameActivity = {
  id: string
  game: string
  gameId: string
  recordedAt: string
  missionDate: string
  missionDay: number | null
  source: 'synthetic-demo' | 'participant-entered'
  metrics: Record<string, number | string>
}

export type TlxRatings = {
  mentalDemand: number
  physicalDemand: number
  temporalDemand: number
  performance: number
  effort: number
  frustration: number
}

export type TlxAssessment = {
  id: string
  sessionId: string
  recordedAt: string
  source: Provenance
  ratings: TlxRatings
  rawScore: number
  pairwiseComparisons: { first: keyof TlxRatings; second: keyof TlxRatings; selected: keyof TlxRatings }[] | null
  weightedScore: number | null
  weights: Record<keyof TlxRatings, number> | null
}

export type FollowUp = {
  id: string
  title: string
  description: string
  createdAt: string
  dueDate: string
  status: 'open' | 'completed'
  completedAt: string | null
  outcome: string
  linkedRecordId: string | null
  source: Provenance
}

export type ResearchReference = {
  id: string
  accession: string
  title: string
  context: string
  description?: string
  assays: string[]
  sourceUrl: string
  retrievedAt: string
  source: 'external-nasa-osdr'
}

export type CheckInDisposition = {
  date: string
  status: 'deferred' | 'skipped'
}

export type HaloData = {
  checkIns: CheckIn[]
  taskSessions: TaskSession[]
  gameActivities: GameActivity[]
  tlxAssessments: TlxAssessment[]
  followUps: FollowUp[]
  researchReferences: ResearchReference[]
  checkInDisposition: CheckInDisposition | null
  reviewedTrendDates: string[]
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createEmptyData(): HaloData {
  return {
    checkIns: [],
    taskSessions: [],
    gameActivities: [],
    tlxAssessments: [],
    followUps: [],
    researchReferences: [],
    checkInDisposition: null,
    reviewedTrendDates: [],
  }
}

export function createSyntheticDemoData(referenceTime = new Date()): Pick<HaloData, 'checkIns' | 'taskSessions' | 'tlxAssessments'> {
  const sleepHours = [4.1, 3.8, 4.0, 3.6, 4.2, 3.5, 3.9, 4.3, 3.7, 3.4, 3.2, 3.8, 3.5, 4.0, 3.6, 4.2, 3.1, 3.7, 3.4, 4.1, 3.3, 3.8, 4.0, 3.0, 3.9, 3.5, 4.2, 3.4, 3.8, 3.2]
  const stress = [9, 9, 8, 10, 9, 10, 9, 8, 10, 9, 10, 9, 9, 10, 9, 8, 10, 9, 9, 8, 10, 9, 8, 10, 9, 10, 8, 9, 10, 9]
  const workload = [88, 91, 86, 95, 89, 97, 92, 85, 96, 93, 98, 91, 90, 99, 94, 87, 98, 92, 95, 84, 100, 96, 89, 99, 86, 94, 88, 97, 91, 96]
  const heartRate = [102, 106, 100, 111, 108, 114, 105, 99, 116, 110, 119, 107, 104, 121, 112, 101, 118, 109, 115, 98, 122, 117, 103, 124, 100, 113, 105, 120, 108, 116]
  const bloodPressure = [[152, 96], [158, 99], [150, 94], [164, 103], [160, 101], [168, 106], [155, 97], [151, 95], [170, 108], [163, 102], [174, 111], [162, 101], [157, 98], [176, 112], [166, 105], [153, 96], [172, 109], [161, 100], [169, 106], [150, 93], [178, 113], [171, 108], [156, 97], [180, 114], [152, 95], [165, 104], [154, 96], [173, 110], [159, 99], [168, 107]]
  const checkInNotes = [
    'Simulated poor-state scenario for UI testing only.',
    'NYMPHA record with a short sleep window.',
    'Generated example; not a participant observation.',
    'Demo-only high workload and stress example.',
    'Generated NYMPHA scenario value; do not use for health decisions.',
    'Generated NYMPHA warning-state record for interface preview.',
  ]
  const checkIns: CheckIn[] = sleepHours.map((sleep, index) => {
    const recordedAt = new Date(referenceTime)
    recordedAt.setDate(recordedAt.getDate() - (sleepHours.length - index - 1))
    recordedAt.setHours(9, 0, 0, 0)
    return {
      id: `synthetic-demo-checkin-${localDateKey(recordedAt)}`,
      recordedAt: recordedAt.toISOString(),
      source: 'synthetic-demo',
      sleepHours: sleep,
      stress: stress[index],
      currentWorkload: workload[index],
      restingHeartRate: heartRate[index],
      bloodPressureSystolic: bloodPressure[index][0],
      bloodPressureDiastolic: bloodPressure[index][1],
      rehabilitationPrecisionPercent: null,
      rehabilitationReactionMs: null,
      rehabilitationAttentionPercent: null,
      dailyTlxRatings: null,
      sourceDetail: 'NYMPHA generated preview data',
      context: 'Generated NYMPHA data for interface preview; not participant observations or health advice.',
      notes: index % 4 === 1 ? '' : checkInNotes[index % checkInNotes.length],
    }
  })

  const sessionConfigs: {
    id: string
    game: GameKind
    daysAgo: number
    durationMs: number
    trialResults: Omit<TaskTrial, 'sessionId' | 'trialId' | 'source'>[]
    ratings: TlxRatings
  }[] = [
    {
      id: 'synthetic-demo-session-signal-7d',
      game: 'signal-match',
      daysAgo: 7,
      durationMs: 72_000,
      trialResults: [
        { stimulus: '◇ · target ◇', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 480, outcome: 'hit' },
        { stimulus: '○ · target △', expectedResponse: 'no-match', actualResponse: 'no-match', reactionTimeMs: 620, outcome: 'hit' },
        { stimulus: '△ · target △', expectedResponse: 'match', actualResponse: null, reactionTimeMs: null, outcome: 'omission' },
        { stimulus: '✦ · target ◇', expectedResponse: 'no-match', actualResponse: 'match', reactionTimeMs: 510, outcome: 'error' },
        { stimulus: '◇ · target ◇', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 440, outcome: 'hit' },
        { stimulus: '○ · target ○', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 580, outcome: 'hit' },
      ],
      ratings: { mentalDemand: 88, physicalDemand: 73, temporalDemand: 91, performance: 82, effort: 89, frustration: 78 },
    },
    {
      id: 'synthetic-demo-session-orbital-3d',
      game: 'orbital-supply-catch',
      daysAgo: 3,
      durationMs: 91_000,
      trialResults: [
        { stimulus: 'supply pod · lane 1', expectedResponse: 'catch', actualResponse: 'catch', reactionTimeMs: 530, outcome: 'hit' },
        { stimulus: 'debris · lane 2', expectedResponse: 'avoid', actualResponse: 'avoid', reactionTimeMs: 610, outcome: 'hit' },
        { stimulus: 'supply pod · lane 3', expectedResponse: 'catch', actualResponse: 'catch', reactionTimeMs: 570, outcome: 'hit' },
        { stimulus: 'debris · lane 1', expectedResponse: 'avoid', actualResponse: 'catch', reactionTimeMs: 490, outcome: 'error' },
        { stimulus: 'supply pod · lane 2', expectedResponse: 'catch', actualResponse: null, reactionTimeMs: null, outcome: 'omission' },
        { stimulus: 'debris · lane 3', expectedResponse: 'avoid', actualResponse: 'avoid', reactionTimeMs: 640, outcome: 'hit' },
      ],
      ratings: { mentalDemand: 93, physicalDemand: 68, temporalDemand: 96, performance: 87, effort: 92, frustration: 84 },
    },
    {
      id: 'synthetic-demo-session-signal-1d',
      game: 'signal-match',
      daysAgo: 1,
      durationMs: 68_000,
      trialResults: [
        { stimulus: '◇ · target ◇', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 455, outcome: 'hit' },
        { stimulus: '○ · target △', expectedResponse: 'no-match', actualResponse: 'no-match', reactionTimeMs: 590, outcome: 'hit' },
        { stimulus: '△ · target △', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 510, outcome: 'hit' },
        { stimulus: '✦ · target ◇', expectedResponse: 'no-match', actualResponse: 'no-match', reactionTimeMs: 575, outcome: 'hit' },
        { stimulus: '◇ · target ◇', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 465, outcome: 'hit' },
        { stimulus: '○ · target ○', expectedResponse: 'match', actualResponse: 'match', reactionTimeMs: 540, outcome: 'hit' },
      ],
      ratings: { mentalDemand: 84, physicalDemand: 64, temporalDemand: 88, performance: 76, effort: 86, frustration: 72 },
    },
  ]

  const taskSessions: TaskSession[] = []
  const tlxAssessments: TlxAssessment[] = []
  for (const config of sessionConfigs) {
    const completed = new Date(referenceTime)
    completed.setDate(completed.getDate() - config.daysAgo)
    completed.setHours(15, 20, 0, 0)
    const completedAt = completed.toISOString()
    const startedAt = new Date(completed.getTime() - config.durationMs).toISOString()
    const trials: TaskTrial[] = config.trialResults.map((trial, index) => ({
      ...trial,
      sessionId: config.id,
      trialId: `${config.id}-trial-${index + 1}`,
      source: 'synthetic-demo',
    }))
    taskSessions.push({
      id: config.id,
      game: config.game,
      source: 'synthetic-demo',
      startedAt,
      completedAt,
      durationMs: config.durationMs,
      trials,
    })

    const dimensions = Object.keys(config.ratings) as (keyof TlxRatings)[]
    const pairwiseComparisons = dimensions.flatMap((first, index) => dimensions.slice(index + 1).map(second => ({
      first,
      second,
      selected: config.ratings[first] >= config.ratings[second] ? first : second,
    })))
    const weights = Object.fromEntries(dimensions.map(dimension => [
      dimension,
      pairwiseComparisons.filter(comparison => comparison.selected === dimension).length,
    ])) as Record<keyof TlxRatings, number>
    const rawScore = Number((Object.values(config.ratings).reduce((sum, value) => sum + value, 0) / dimensions.length).toFixed(1))
    const weightedScore = Number((dimensions.reduce((sum, dimension) => sum + config.ratings[dimension] * weights[dimension], 0) / pairwiseComparisons.length).toFixed(1))
    tlxAssessments.push({
      id: `${config.id}-tlx`,
      sessionId: config.id,
      recordedAt: completedAt,
      source: 'synthetic-demo',
      ratings: config.ratings,
      rawScore,
      pairwiseComparisons,
      weightedScore,
      weights,
    })
  }
  return { checkIns, taskSessions, tlxAssessments }
}

export function createJudgeDemoData(referenceTime = new Date()): HaloData {
  const checkIns: CheckIn[] = Array.from({ length: 250 }, (_, dayIndex) => {
    const recordedAt = new Date(referenceTime)
    recordedAt.setDate(recordedAt.getDate() - (249 - dayIndex))
    recordedAt.setHours(9, 0, 0, 0)

    const longTrend = dayIndex / 249
    const recentTrend = dayIndex < 235 ? 0 : (dayIndex - 235) / 14
    const historicalVariation = Math.sin(dayIndex * 0.37)
    const recent = recentTrend > 0
    const value = (baseline: number, change: number, variation: number, minimum: number, maximum: number) => (
      Math.round(Math.min(maximum, Math.max(minimum, baseline + change * longTrend + (recent ? 0 : historicalVariation * variation))))
    )
    const recentValue = (start: number, end: number, minimum: number, maximum: number, decimals = 0) => {
      const current = start + (end - start) * recentTrend
      const scale = 10 ** decimals
      return Math.min(maximum, Math.max(minimum, Math.round(current * scale) / scale))
    }

    const sleepHours = recent
      ? recentValue(6.6, 3.4, 0, 24, 1)
      : Math.round((7.4 - 0.8 * longTrend + historicalVariation * 0.25) * 10) / 10
    const stress = recent
      ? recentValue(4, 10, 1, 10)
      : value(3, 1, 0.5, 1, 10)
    const currentWorkload = recent
      ? recentValue(43, 99, 0, 100)
      : value(34, 8, 3, 0, 100)
    const restingHeartRate = recent
      ? recentValue(72, 112, 30, 220)
      : value(65, 6, 3, 30, 220)
    const bloodPressureSystolic = recent
      ? recentValue(124, 174, 40, 300)
      : value(118, 6, 4, 40, 300)
    const bloodPressureDiastolic = recent
      ? recentValue(79, 108, 20, 200)
      : value(74, 4, 3, 20, 200)
    const rehabilitationPrecisionPercent = recent
      ? recentValue(82, 42, 0, 100)
      : value(88, -4, 2, 0, 100)
    const rehabilitationReactionMs = recent
      ? recentValue(480, 980, 0, 5_000)
      : value(400, 40, 18, 0, 5_000)
    const rehabilitationAttentionPercent = recent
      ? recentValue(84, 40, 0, 100)
      : value(90, -4, 2, 0, 100)
    const tlxScore = (start: number, end: number, variation: number) => Math.round(Math.min(100, Math.max(
      0,
      recent ? start + (end - start) * recentTrend : start + 10 * longTrend + historicalVariation * variation,
    )))

    return {
      id: `synthetic-demo-checkin-${localDateKey(recordedAt)}`,
      recordedAt: recordedAt.toISOString(),
      source: 'synthetic-demo',
      sleepHours,
      stress,
      currentWorkload,
      restingHeartRate,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      rehabilitationPrecisionPercent,
      rehabilitationReactionMs,
      rehabilitationAttentionPercent,
      dailyTlxRatings: {
        mentalDemand: tlxScore(38, 88, 5),
        physicalDemand: tlxScore(24, 55, 4),
        temporalDemand: tlxScore(32, 91, 6),
        performance: tlxScore(29, 82, 5),
        effort: tlxScore(36, 94, 5),
        frustration: tlxScore(25, 86, 7),
      },
      notMeasuredFields: [],
      sourceDetail: 'NYMPHA generated data',
      context: 'Generated for interface preview; not actual astronaut measurements or live mission telemetry.',
      notes: 'NYMPHA generated record for interface preview.',
    }
  })

  const gameActivities: GameActivity[] = checkIns.flatMap((checkIn, dayIndex) => {
    const recordedAt = new Date(checkIn.recordedAt)
    recordedAt.setHours(15, 0, 0, 0)
    const longTrend = dayIndex / 249
    const recentTrend = dayIndex < 235 ? 0 : (dayIndex - 235) / 14
    return rehabGames.map((game, gameIndex) => {
      const variation = Math.sin(dayIndex * 0.39 + game.id * 0.83) * 0.22
      const gameOffset = (game.id % 5) * 0.18 + (game.id % 3) * 0.08
      const scoreOutOf10 = Number(Math.min(9.8, Math.max(
        2.2,
        8.6 - gameOffset - longTrend * 0.6 - recentTrend * 4.4 + variation,
      )).toFixed(1))
      const gameRecordedAt = new Date(recordedAt.getTime() + gameIndex * 60_000)
      return {
        id: `synthetic-demo-game-${dayIndex + 1}-${game.id}`,
        game: game.title,
        gameId: `rehabilitation-${game.id}`,
        recordedAt: gameRecordedAt.toISOString(),
        missionDate: localDateKey(gameRecordedAt),
        missionDay: dayIndex + 1,
        source: 'synthetic-demo' as const,
        metrics: {
          scoreOutOf10,
          finalScore: Math.round(scoreOutOf10 * 10),
          successfulTrials: Math.round(scoreOutOf10 * 10),
          totalTrials: 100,
        },
      }
    })
  })

  const taskSessions: TaskSession[] = []
  const tlxAssessments: TlxAssessment[] = []
  const dimensions: (keyof TlxRatings)[] = ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration']
  for (const [dayIndex, checkIn] of checkIns.entries()) {
    const completed = new Date(checkIn.recordedAt)
    completed.setHours(16, 0, 0, 0)
    const completedAt = completed.toISOString()
    const durationMs = 68_000 + (dayIndex % 8) * 3_000
    const startedAt = new Date(completed.getTime() - durationMs).toISOString()
    const id = `synthetic-demo-task-${dayIndex + 1}`
    const game: GameKind = dayIndex % 2 === 0 ? 'signal-match' : 'orbital-supply-catch'
    const abilityScore = game === 'signal-match'
      ? checkIn.rehabilitationPrecisionPercent ?? 80
      : checkIn.rehabilitationAttentionPercent ?? 80
    const hitCount = Math.round(abilityScore / 100 * 6)
    const trials: TaskTrial[] = Array.from({ length: 6 }, (_, trialIndex) => {
      const expectedResponse: TaskTrial['expectedResponse'] = game === 'signal-match'
        ? trialIndex % 2 === 0 ? 'match' : 'no-match'
        : trialIndex % 2 === 0 ? 'catch' : 'avoid'
      const hit = trialIndex < hitCount
      const actualResponse: TaskTrial['actualResponse'] = hit
        ? expectedResponse
        : expectedResponse === 'match' ? 'no-match' : expectedResponse === 'no-match' ? 'match' : expectedResponse === 'catch' ? 'avoid' : 'catch'
      return {
        sessionId: id,
        trialId: `${id}-trial-${trialIndex + 1}`,
        source: 'synthetic-demo',
        stimulus: game === 'signal-match' ? `symbol ${trialIndex + 1}` : trialIndex % 2 === 0 ? 'supply pod' : 'debris field',
        expectedResponse,
        actualResponse,
        reactionTimeMs: hit ? 420 + dayIndex + trialIndex * 17 : null,
        outcome: hit ? 'hit' : 'error',
      }
    })
    taskSessions.push({ id, game, source: 'synthetic-demo', startedAt, completedAt, durationMs, trials })

    const ratings = checkIn.dailyTlxRatings
    if (!ratings) continue
    const pairwiseComparisons = dimensions.flatMap((first, index) => dimensions.slice(index + 1).map(second => ({
      first,
      second,
      selected: ratings[first] >= ratings[second] ? first : second,
    })))
    const weights = Object.fromEntries(dimensions.map(dimension => [
      dimension,
      pairwiseComparisons.filter(comparison => comparison.selected === dimension).length,
    ])) as Record<keyof TlxRatings, number>
    const rawScore = Number((dimensions.reduce((sum, dimension) => sum + ratings[dimension], 0) / dimensions.length).toFixed(1))
    const weightedScore = Number((dimensions.reduce((sum, dimension) => sum + ratings[dimension] * weights[dimension], 0) / pairwiseComparisons.length).toFixed(1))
    tlxAssessments.push({
      id: `${id}-tlx`,
      sessionId: id,
      recordedAt: completedAt,
      source: 'synthetic-demo',
      ratings,
      rawScore,
      pairwiseComparisons,
      weightedScore,
      weights,
    })
  }

  return {
    ...createEmptyData(),
    checkIns,
    taskSessions,
    gameActivities,
    tlxAssessments,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function inRange(value: number | null, minimum: number, maximum: number, integer = false) {
  return value === null || (value >= minimum && value <= maximum && (!integer || Number.isInteger(value)))
}

function isDailyTlxRatings(value: unknown): value is TlxRatings | null {
  if (value === null) return true
  if (!isRecord(value)) return false
  return ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration']
    .every(key => typeof value[key] === 'number' && Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 100)
}

function provenance(value: unknown, fallback: Provenance = 'participant-entered'): value is Provenance {
  return value === 'synthetic-demo' || value === 'participant-entered' || value === 'external-nasa-osdr' || value === fallback
}

function isCheckIn(value: unknown): value is CheckIn {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.recordedAt === 'string'
    && Number.isFinite(Date.parse(value.recordedAt))
    && provenance(value.source)
    && isNumberOrNull(value.sleepHours) && inRange(value.sleepHours, 0, 24)
    && isNumberOrNull(value.stress) && inRange(value.stress, 1, 10, true)
    && isNumberOrNull(value.currentWorkload) && inRange(value.currentWorkload, 0, 100, true)
    && isNumberOrNull(value.restingHeartRate) && inRange(value.restingHeartRate, 30, 220, true)
    && isNumberOrNull(value.bloodPressureSystolic) && inRange(value.bloodPressureSystolic, 40, 300, true)
    && isNumberOrNull(value.bloodPressureDiastolic) && inRange(value.bloodPressureDiastolic, 20, 200, true)
    && isNumberOrNull(value.rehabilitationPrecisionPercent) && inRange(value.rehabilitationPrecisionPercent, 0, 100, true)
    && isNumberOrNull(value.rehabilitationReactionMs) && inRange(value.rehabilitationReactionMs, 0, 5_000, true)
    && isNumberOrNull(value.rehabilitationAttentionPercent) && inRange(value.rehabilitationAttentionPercent, 0, 100, true)
    && isDailyTlxRatings(value.dailyTlxRatings)
    && (value.notMeasuredFields === undefined || Array.isArray(value.notMeasuredFields)
      && value.notMeasuredFields.every(field => [
        'sleepHours', 'stress', 'currentWorkload', 'restingHeartRate',
        'bloodPressureSystolic', 'bloodPressureDiastolic',
      ].includes(String(field))))
    && typeof value.sourceDetail === 'string'
    && typeof value.context === 'string'
    && typeof value.notes === 'string'
}

function isTaskTrial(value: unknown, sessionId: string): value is TaskTrial {
  if (!isRecord(value)
    || value.sessionId !== sessionId
    || typeof value.trialId !== 'string'
    || !provenance(value.source)
    || typeof value.stimulus !== 'string'
    || !['match', 'no-match', 'catch', 'avoid'].includes(String(value.expectedResponse))
    || !(value.actualResponse === null || ['match', 'no-match', 'catch', 'avoid'].includes(String(value.actualResponse)))
    || !isNumberOrNull(value.reactionTimeMs)
    || !(value.reactionTimeMs === null || value.reactionTimeMs >= 0)
    || !['hit', 'error', 'omission'].includes(String(value.outcome))) return false
  const expected = value.expectedResponse
  const actual = value.actualResponse
  const expectedOutcome = actual === null ? 'omission' : actual === expected ? 'hit' : 'error'
  return value.outcome === expectedOutcome
}

function isTaskSession(value: unknown): value is TaskSession {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.game === 'signal-match' || value.game === 'orbital-supply-catch')
    && provenance(value.source)
    && typeof value.startedAt === 'string'
    && Number.isFinite(Date.parse(value.startedAt))
    && typeof value.completedAt === 'string'
    && Number.isFinite(Date.parse(value.completedAt))
    && typeof value.durationMs === 'number'
    && Number.isFinite(value.durationMs)
    && value.durationMs >= 0
    && Date.parse(value.completedAt) >= Date.parse(value.startedAt)
    && Array.isArray(value.trials)
    && value.trials.every(trial => isTaskTrial(trial, value.id as string))
}

function isGameActivity(value: unknown): value is GameActivity {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.length > 120
    || typeof value.game !== 'string' || !value.game.trim() || value.game.length > 80
    || typeof value.gameId !== 'string' || value.gameId.length > 120
    || typeof value.recordedAt !== 'string' || !Number.isFinite(Date.parse(value.recordedAt))
    || typeof value.missionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.missionDate)
    || !(value.missionDay === null || typeof value.missionDay === 'number' && Number.isInteger(value.missionDay) && value.missionDay >= 1 && value.missionDay <= 250)
    || (value.source !== 'synthetic-demo' && value.source !== 'participant-entered')
    || !isRecord(value.metrics)) return false
  const entries = Object.entries(value.metrics)
  return entries.length > 0 && entries.length <= 12 && entries.every(([key, metric]) =>
    /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)
    && (typeof metric === 'number' && Number.isFinite(metric) && Math.abs(metric) <= 1_000_000
      || typeof metric === 'string' && metric.length <= 80),
  )
}

const ratingKeys: (keyof TlxRatings)[] = ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration']

function isTlxAssessment(value: unknown): value is TlxAssessment {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.sessionId !== 'string'
    || typeof value.recordedAt !== 'string'
    || !Number.isFinite(Date.parse(value.recordedAt))
    || !provenance(value.source)
    || typeof value.rawScore !== 'number'
    || !Number.isFinite(value.rawScore)
    || !isRecord(value.ratings)) return false
  const ratings = value.ratings
  if (!ratingKeys.every(key => typeof ratings[key] === 'number' && Number.isInteger(ratings[key]) && Number(ratings[key]) >= 0 && Number(ratings[key]) <= 100)) return false
  const expectedRaw = Number((ratingKeys.reduce((sum, key) => sum + Number(ratings[key]), 0) / ratingKeys.length).toFixed(1))
  if (value.rawScore !== expectedRaw) return false
  const weights = value.weights
  const comparisons = value.pairwiseComparisons
  if (value.weightedScore === null && weights === null && comparisons === null) return true
  if (typeof value.weightedScore !== 'number' || !Number.isFinite(value.weightedScore) || !isRecord(weights) || !Array.isArray(comparisons) || comparisons.length !== 15) return false
  if (!ratingKeys.every(key => typeof weights[key] === 'number' && Number.isInteger(weights[key]) && Number(weights[key]) >= 0 && Number(weights[key]) <= 15)) return false
  if (ratingKeys.reduce((sum, key) => sum + Number(weights[key]), 0) !== 15) return false
  const computedWeights = Object.fromEntries(ratingKeys.map(key => [key, 0])) as Record<keyof TlxRatings, number>
  for (const comparison of comparisons) {
    if (!isRecord(comparison)
      || !ratingKeys.includes(comparison.first as keyof TlxRatings)
      || !ratingKeys.includes(comparison.second as keyof TlxRatings)
      || !ratingKeys.includes(comparison.selected as keyof TlxRatings)
      || comparison.first === comparison.second
      || (comparison.selected !== comparison.first && comparison.selected !== comparison.second)) return false
    computedWeights[comparison.selected as keyof TlxRatings] += 1
  }
  if (!ratingKeys.every(key => computedWeights[key] === weights[key])) return false
  const expectedWeighted = Number((ratingKeys.reduce((sum, key) => sum + Number(weights[key]) * Number(ratings[key]), 0) / 15).toFixed(1))
  return value.weightedScore === expectedWeighted
}

function isFollowUp(value: unknown): value is FollowUp {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.dueDate === 'string'
    && Number.isFinite(Date.parse(value.createdAt))
    && Number.isFinite(Date.parse(value.dueDate))
    && (value.status === 'open' || value.status === 'completed')
    && (typeof value.completedAt === 'string' || value.completedAt === null)
    && typeof value.outcome === 'string'
    && (typeof value.linkedRecordId === 'string' || value.linkedRecordId === null)
    && provenance(value.source)
}

function isResearchReference(value: unknown): value is ResearchReference {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.accession === 'string'
    && typeof value.title === 'string'
    && typeof value.context === 'string'
    && (!('description' in value) || typeof value.description === 'string')
    && Array.isArray(value.assays)
    && value.assays.every(item => typeof item === 'string')
    && typeof value.sourceUrl === 'string'
    && typeof value.retrievedAt === 'string'
    && Number.isFinite(Date.parse(value.retrievedAt))
    && value.source === 'external-nasa-osdr'
}

function migrateLegacySession(value: unknown): TaskSession | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.trials)) return null
  const startedAt = typeof value.startedAt === 'string' ? value.startedAt : ''
  const completedAt = typeof value.completedAt === 'string' ? value.completedAt : ''
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(completedAt))) return null
  const game: GameKind = value.game === 'orbital-supply-catch' ? 'orbital-supply-catch' : 'signal-match'
  const sessionId = value.id
  const trials: TaskTrial[] = value.trials.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.stimulus !== 'string') return []
    const expectedResponse = game === 'signal-match'
      ? item.expectedMatch === true ? 'match' : 'no-match'
      : item.expectedResponse === 'catch' ? 'catch' : 'avoid'
    const actualResponse = typeof item.responseMatch === 'boolean'
      ? item.responseMatch ? 'match' : 'no-match'
      : null
    const outcome: TaskOutcome = actualResponse === null
      ? 'omission'
      : typeof item.correct === 'boolean'
        ? item.correct ? 'hit' : 'error'
        : actualResponse === expectedResponse ? 'hit' : 'error'
    return [{
      sessionId,
      trialId: `${sessionId}-trial-${index + 1}`,
      source: 'participant-entered',
      stimulus: item.stimulus,
      expectedResponse,
      actualResponse,
      reactionTimeMs: typeof item.responseTimeMs === 'number' && Number.isFinite(item.responseTimeMs) ? item.responseTimeMs : null,
      outcome,
    }]
  })
  return { id: sessionId, game, source: 'participant-entered', startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)), trials }
}

function migrateLegacyAssessment(value: unknown): TlxAssessment | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.sessionId !== 'string' || typeof value.recordedAt !== 'string' || !isRecord(value.ratings)) return null
  const legacyRatings = value.ratings
  if (!ratingKeys.every(key => typeof legacyRatings[key] === 'number')) return null
  const ratings = legacyRatings as TlxRatings
  const rawScore = ratingKeys.reduce((sum, key) => sum + ratings[key], 0) / ratingKeys.length
  return { id: value.id, sessionId: value.sessionId, recordedAt: value.recordedAt, source: 'participant-entered', ratings, rawScore, pairwiseComparisons: null, weightedScore: null, weights: null }
}

export function parseHaloData(value: unknown): HaloData {
  if (!isRecord(value)) throw new Error('Saved HALO data is invalid. Export anything you need before resetting local storage.')
  if ('checkIns' in value && !Array.isArray(value.checkIns)) throw new Error('Saved HALO check-ins are invalid.')
  if ('taskSessions' in value && !Array.isArray(value.taskSessions)) throw new Error('Saved HALO task sessions are invalid.')
  if ('gameActivities' in value && !Array.isArray(value.gameActivities)) throw new Error('Saved game activity records are invalid.')
  if ('signalSessions' in value && !Array.isArray(value.signalSessions)) throw new Error('Saved legacy task sessions are invalid.')
  if ('tlxAssessments' in value && !Array.isArray(value.tlxAssessments)) throw new Error('Saved NASA-TLX records are invalid.')
  if ('followUps' in value && !Array.isArray(value.followUps)) throw new Error('Saved follow-ups are invalid.')
  if ('researchReferences' in value && !Array.isArray(value.researchReferences)) throw new Error('Saved NASA OSDR references are invalid.')
  const rawSessions = Array.isArray(value.taskSessions) ? value.taskSessions : Array.isArray(value.signalSessions) ? value.signalSessions : []
  const taskSessions = rawSessions
    .map(item => {
      const session = isTaskSession(item) ? item : migrateLegacySession(item)
      if (!session) throw new Error('A saved task session could not be validated.')
      return session
    })
  const gameActivities = (Array.isArray(value.gameActivities) ? value.gameActivities : []).map(item => {
    if (!isGameActivity(item)) throw new Error('A saved game activity record could not be validated.')
    return item
  })
  const rawAssessments = Array.isArray(value.tlxAssessments) ? value.tlxAssessments : []
  const tlxAssessments = rawAssessments
    .map(item => {
      const assessment = isTlxAssessment(item) ? item : migrateLegacyAssessment(item)
      if (!assessment) throw new Error('A saved NASA-TLX record could not be validated.')
      return assessment
    })
  const taskSessionIds = new Set(taskSessions.map(session => session.id))
  const validAssessments = tlxAssessments.filter(assessment => taskSessionIds.has(assessment.sessionId))
  const checkIns = (Array.isArray(value.checkIns) ? value.checkIns : []).flatMap(item => {
    if (!isRecord(item)) throw new Error('A saved check-in must be an object.')
    const normalized = {
      ...item,
      source: provenance(item.source) ? item.source : 'participant-entered',
      currentWorkload: 'currentWorkload' in item ? item.currentWorkload : null,
      sourceDetail: typeof item.sourceDetail === 'string' ? item.sourceDetail : '',
      context: typeof item.context === 'string' ? item.context : '',
      sleepHours: 'sleepHours' in item ? item.sleepHours : null,
      stress: 'stress' in item ? item.stress : null,
      restingHeartRate: 'restingHeartRate' in item ? item.restingHeartRate : null,
      bloodPressureSystolic: 'bloodPressureSystolic' in item ? item.bloodPressureSystolic : null,
      bloodPressureDiastolic: 'bloodPressureDiastolic' in item ? item.bloodPressureDiastolic : null,
      rehabilitationPrecisionPercent: 'rehabilitationPrecisionPercent' in item ? item.rehabilitationPrecisionPercent : null,
      rehabilitationReactionMs: 'rehabilitationReactionMs' in item ? item.rehabilitationReactionMs : null,
      rehabilitationAttentionPercent: 'rehabilitationAttentionPercent' in item ? item.rehabilitationAttentionPercent : null,
      dailyTlxRatings: 'dailyTlxRatings' in item ? item.dailyTlxRatings : null,
      notes: typeof item.notes === 'string' ? item.notes : '',
    }
    if (!isCheckIn(normalized)) throw new Error('A saved check-in could not be validated.')
    return [normalized]
  })
  const followUps = (Array.isArray(value.followUps) ? value.followUps : []).flatMap(item => {
    if (!isRecord(item)) throw new Error('A saved follow-up must be an object.')
    if (item.source === 'synthetic-demo') return []
    const migrated = { ...item, source: provenance(item.source) ? item.source : 'participant-entered' }
    if (!isFollowUp(migrated)) throw new Error('A saved follow-up could not be validated.')
    return [migrated]
  })
  const researchReferences = Array.isArray(value.researchReferences) ? value.researchReferences : []
  const disposition = value.checkInDisposition
  let checkInDisposition: CheckInDisposition | null = null
  if (isRecord(disposition) && typeof disposition.date === 'string' && (disposition.status === 'deferred' || disposition.status === 'skipped')) {
    checkInDisposition = { date: disposition.date, status: disposition.status }
  } else if (disposition !== null && disposition !== undefined) {
    throw new Error('Saved check-in status could not be validated.')
  }
  if ('reviewedTrendDates' in value && (!Array.isArray(value.reviewedTrendDates) || !value.reviewedTrendDates.every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)))) {
    throw new Error('Saved trend-review dates could not be validated.')
  }
  const reviewedTrendDates = Array.isArray(value.reviewedTrendDates) ? value.reviewedTrendDates as string[] : []
  if (!researchReferences.every(isResearchReference)) throw new Error('A saved NASA OSDR reference could not be validated.')
  return { checkIns, taskSessions, gameActivities, tlxAssessments: validAssessments, followUps, researchReferences, checkInDisposition, reviewedTrendDates }
}
