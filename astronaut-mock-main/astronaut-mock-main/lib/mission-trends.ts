import type { CheckIn } from '@/lib/halo-store'

export const TREND_STATES = ['Baseline', 'Rising', 'Higher'] as const
export type TrendState = typeof TREND_STATES[number]

type TrendMetricDefinition = {
  label: string
  field: keyof Pick<CheckIn,
    | 'sleepHours'
    | 'stress'
    | 'currentWorkload'
    | 'restingHeartRate'
    | 'bloodPressureSystolic'
    | 'bloodPressureDiastolic'
    | 'rehabilitationPrecisionPercent'
    | 'rehabilitationReactionMs'
    | 'rehabilitationAttentionPercent'
  >
  unit: string
  adverseIndex: (value: number) => number
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))
const roundOne = (value: number) => Math.round(value * 10) / 10

const metricDefinitions: TrendMetricDefinition[] = [
  { label: 'Sleep', field: 'sleepHours', unit: 'h', adverseIndex: value => clampPercent((8 - value) / 6 * 100) },
  { label: 'Stress', field: 'stress', unit: '/10', adverseIndex: value => clampPercent((value - 1) / 9 * 100) },
  { label: 'Workload', field: 'currentWorkload', unit: '/100', adverseIndex: clampPercent },
  { label: 'Heart rate', field: 'restingHeartRate', unit: 'bpm', adverseIndex: value => clampPercent((value - 60) / 80 * 100) },
  { label: 'Systolic BP', field: 'bloodPressureSystolic', unit: 'mmHg', adverseIndex: value => clampPercent((value - 110) / 80 * 100) },
  { label: 'Diastolic BP', field: 'bloodPressureDiastolic', unit: 'mmHg', adverseIndex: value => clampPercent((value - 70) / 50 * 100) },
  { label: 'Rehab precision', field: 'rehabilitationPrecisionPercent', unit: '%', adverseIndex: value => clampPercent(100 - value) },
  { label: 'Reaction time', field: 'rehabilitationReactionMs', unit: 'ms', adverseIndex: value => clampPercent((value - 350) / 850 * 100) },
  { label: 'Rehab attention', field: 'rehabilitationAttentionPercent', unit: '%', adverseIndex: value => clampPercent(100 - value) },
]

function stateForIndex(value: number): TrendState {
  if (value >= 67) return 'Higher'
  if (value >= 34) return 'Rising'
  return 'Baseline'
}

export function analyzeMissionTrend(records: CheckIn[]) {
  const recent = records
    .filter(record => record.source === 'synthetic-demo')
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
    .slice(-15)

  const points = recent.map(record => {
    const metricIndices = metricDefinitions.flatMap(metric => {
      const value = record[metric.field]
      return typeof value === 'number' ? [metric.adverseIndex(value)] : []
    })
    const index = metricIndices.length
      ? roundOne(metricIndices.reduce((sum, value) => sum + value, 0) / metricIndices.length)
      : 0
    return {
      date: record.recordedAt,
      index,
      wellnessIndex: roundOne(100 - index),
      state: stateForIndex(index),
    }
  })

  const counts: Record<TrendState, Record<TrendState, number>> = {
    Baseline: { Baseline: 0, Rising: 0, Higher: 0 },
    Rising: { Baseline: 0, Rising: 0, Higher: 0 },
    Higher: { Baseline: 0, Rising: 0, Higher: 0 },
  }
  for (let index = 1; index < points.length; index += 1) {
    counts[points[index - 1].state][points[index].state] += 1
  }

  const stateCounts = TREND_STATES.map(state => ({
    state,
    count: points.filter(point => point.state === state).length,
  }))
  const latest = recent[recent.length - 1]
  const previous = recent.length > 1 ? recent[recent.length - 2] : null
  const metrics = latest ? metricDefinitions.flatMap(metric => {
    const currentValue = latest[metric.field]
    if (typeof currentValue !== 'number') return []
    const previousValue = previous?.[metric.field]
    const currentIndex = metric.adverseIndex(currentValue)
    const previousIndex = typeof previousValue === 'number' ? metric.adverseIndex(previousValue) : null
    return [{
      label: metric.label,
      unit: metric.unit,
      value: currentValue,
      adverseIndex: roundOne(currentIndex),
      change: previousIndex === null ? null : roundOne(currentIndex - previousIndex),
    }]
  }) : []

  const currentState = points[points.length - 1]?.state ?? null
  const transitionRow = currentState ? counts[currentState] : null
  const probabilityTotal = transitionRow
    ? Object.values(transitionRow).reduce((sum, count) => sum + count + 1, 0)
    : 0
  const nextStateEstimate = transitionRow
    ? TREND_STATES.map(state => ({
      state,
      probability: (transitionRow[state] + 1) / probabilityTotal,
      transitions: transitionRow[state],
    }))
    : []
  const forecast = [...nextStateEstimate].sort((a, b) => b.probability - a.probability)[0] ?? null
  const change = points.length > 1 ? roundOne(points[points.length - 1].wellnessIndex - points[0].wellnessIndex) : null

  return {
    points,
    counts,
    stateCounts,
    metrics,
    currentState,
    currentIndex: points[points.length - 1]?.index ?? null,
    wellnessIndex: points[points.length - 1]?.wellnessIndex ?? null,
    change,
    nextStateEstimate,
    forecast,
  }
}
