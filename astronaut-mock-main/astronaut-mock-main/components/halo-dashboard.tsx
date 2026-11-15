'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Bot, ChevronLeft, ChevronRight, Download, Gauge, HeartHandshake, Home, Info, Settings, Signal, Target, UserRound, X } from 'lucide-react'
import {
  createJudgeDemoData,
  localDateKey,
  type CheckIn,
  type CheckInDisposition,
  type GameActivity,
  type HaloData,
  type Provenance,
  type ResearchReference,
  type TaskSession,
  type TlxAssessment,
  type TlxRatings,
} from '@/lib/halo-store'
import { analyzeMissionTrend, type TrendState } from '@/lib/mission-trends'
import { recommendPracticeGames } from '@/lib/rehab-games'
import { decryptJson, encryptJson } from '@/lib/encrypted-json'
import { BelongingExperience, MLPatternInspector, RehabilitationPractice, ResearchExplorer, YukiAssistant, type YukiGameAnalysis } from '@/components/halo-advanced'

const navigation = [
  { label: 'Dashboard', icon: Home },
  { label: 'Yuki AI', icon: Bot },
  { label: 'Measurements', icon: Signal },
  { label: 'Cognitive Tasks', icon: Target },
  { label: 'NASA-TLX', icon: Gauge },
  { label: 'ML Patterns', icon: Activity },
  { label: 'Research Library', icon: BookOpen },
  { label: 'Belonging', icon: HeartHandshake },
  { label: 'Settings', icon: Settings },
  { label: 'Astronaut Details', icon: UserRound },
  { label: 'Features', icon: Info },
]

const dashboardFeatures = [
  { title: 'Mission overview', description: 'Review recent check-ins, key measurements, mission records, and the illustrative trend indicator.', page: 'Dashboard' },
  { title: 'Astronaut details', description: 'View Yuki Tanaka’s fictional demo profile, including nationality, home district, blood group, and NYMPHA assignment.', page: 'Astronaut Details' },
  { title: 'Daily check-in', description: 'Record sleep, stress, workload, heart rate, blood pressure, and NASA-TLX ratings. Readings not taken can be marked Not measured.', page: 'Dashboard' },
  { title: 'Measurements & history', description: 'Explore prior entries and charts for health and rehabilitation measures across 7-day, 15-day, 30-day, or mission-wide ranges.', page: 'Measurements' },
  { title: 'Cognitive tasks', description: 'Practice with the 25-game playlist or integrated game-and-mission-dilemma activity, then review saved session results.', page: 'Cognitive Tasks' },
  { title: 'NASA-TLX', description: 'Rate six workload dimensions and review raw and weighted scores linked with task sessions.', page: 'NASA-TLX' },
  { title: 'Yuki AI', description: 'Ask the mission companion questions and review recent records or completed practice sessions. Record analysis unlocks after the daily game is saved.', page: 'Yuki AI' },
  { title: 'ML patterns', description: 'Inspect generated NYMPHA trend charts, illustrative tiers, metric signals, and transition estimates with model notes.', page: 'ML Patterns' },
  { title: 'Research Library', description: 'Search NASA OSDR studies by title or accession, inspect sources, and pin references to the mission log.', page: 'Research Library' },
  { title: 'Belonging', description: 'Take an optional visual visit through familiar places in Japan with a photo slideshow and scenic film.', page: 'Belonging' },
  { title: 'Settings & debrief', description: 'Export session records and derived summaries as encrypted JSON, or unlock an encrypted debrief.', page: 'Settings' },
]

const dimensionInfo: { key: keyof TlxRatings; label: string; endpoints: string }[] = [
  { key: 'mentalDemand', label: 'Mental Demand', endpoints: '0 = Very Low · 100 = Very High' },
  { key: 'physicalDemand', label: 'Physical Demand', endpoints: '0 = Very Low · 100 = Very High' },
  { key: 'temporalDemand', label: 'Temporal Demand', endpoints: '0 = Very Low · 100 = Very High' },
  { key: 'performance', label: 'Performance', endpoints: '0 = Perfect · 100 = Failure' },
  { key: 'effort', label: 'Effort', endpoints: '0 = Very Low · 100 = Very High' },
  { key: 'frustration', label: 'Frustration', endpoints: '0 = Very Low · 100 = Very High' },
]
const dimensionKeys = dimensionInfo.map(item => item.key)
const comparisons = dimensionKeys.flatMap((first, index) => dimensionKeys.slice(index + 1).map(second => ({ first, second })))
type TrendRange = '7D' | '15D' | '30D' | 'MISSION'

function localDateTimeValue(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`}>{children}</section>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ProvenanceLabel({ source }: { source: Provenance }) {
  const label = source === 'synthetic-demo' ? 'NYMPHA record' : source === 'external-nasa-osdr' ? 'External NASA OSDR' : 'Entered today'
  return <span className={`source-label ${source === 'synthetic-demo' ? 'synthetic-source' : source === 'external-nasa-osdr' ? 'external-source' : 'participant-source'}`}>{label}</span>
}

function latestCheckIn(records: CheckIn[], key: keyof Pick<CheckIn, 'sleepHours' | 'stress' | 'currentWorkload' | 'restingHeartRate'>) {
  return [...records].sort(compareCheckInRecency).find(record => record[key] !== null) ?? null
}

function compareCheckInRecency(a: CheckIn, b: CheckIn) {
  const participantPriority = Number(b.source === 'participant-entered') - Number(a.source === 'participant-entered')
  return participantPriority || Date.parse(b.recordedAt) - Date.parse(a.recordedAt)
}

function DashboardMetric({ title, unit, field, records, decimals = 0 }: {
  title: string
  unit: string
  field: 'sleepHours' | 'stress' | 'currentWorkload' | 'restingHeartRate'
  records: CheckIn[]
  decimals?: number
}) {
  const record = latestCheckIn(records, field)
  const value = record?.[field]
  return <Card className="overview-metric">
    <span className="overview-metric-title">{title}</span>
    <strong>{record && value !== null && value !== undefined ? value.toFixed(decimals) : 'Not measured'}{record && value !== null && value !== undefined && <small>{unit}</small>}</strong>
    {record ? <div className="overview-metric-meta"><ProvenanceLabel source={record.source}/><time dateTime={record.recordedAt}>{formatDateTime(record.recordedAt)}</time></div> : <span className="overview-metric-meta">No observation recorded</span>}
  </Card>
}

function MissionTrendIndicator({ state, index }: { state: TrendState | null; index: number | null }) {
  const level = state === 'Higher' ? 'high' : state === 'Rising' ? 'medium' : state === 'Baseline' ? 'low' : 'unknown'
  const label = level === 'high' ? 'High Alert' : level === 'medium' ? 'Medium' : level === 'low' ? 'Low' : 'No trend data'

  return <section className={`glass-card mission-alert-card mission-alert-${level}`} role="status" aria-label={`Markov trend indicator: ${label}`}>
    <div className="mission-alert-orb" aria-hidden="true"><span/></div>
    <div className="mission-alert-copy">
      <span className="mission-alert-eyebrow"><AlertTriangle aria-hidden="true"/> MARKOV TREND INDICATOR</span>
      <strong>{label}</strong>
      <p>{state ? `Current model state: ${state}.` : 'There is not enough trend data to assign a level.'}</p>
    </div>
    {index !== null && <div className="mission-alert-index"><span>15-day trend index</span><strong>{index.toFixed(1)}<small>/100</small></strong></div>}
  </section>
}

function MetricChart({ title, unit, field, records, range }: {
  title: string
  unit: string
  field: 'sleepHours' | 'stress' | 'currentWorkload' | 'restingHeartRate' | 'bloodPressureSystolic' | 'bloodPressureDiastolic' | 'rehabilitationPrecisionPercent' | 'rehabilitationReactionMs' | 'rehabilitationAttentionPercent'
  records: CheckIn[]
  range: TrendRange
}) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range !== 'MISSION') start.setDate(start.getDate() - (range === '7D' ? 6 : range === '15D' ? 14 : 29))
  const points = [...records]
    .filter(record => (range === 'MISSION' || Date.parse(record.recordedAt) >= start.getTime()) && record[field] !== null)
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
  const values = points.flatMap(record => {
    const value = record[field]
    return typeof value === 'number' ? [value] : []
  })
  const isBloodPressure = field === 'bloodPressureSystolic' || field === 'bloodPressureDiastolic'
  const minimum = values.length ? Math.min(...values) : 0
  const maximum = values.length ? Math.max(...values) : 1
  const padding = Math.max((maximum - minimum) * 0.12, isBloodPressure ? 10 : 1)
  const floor = isBloodPressure && values.length ? Math.floor((minimum - padding) / 10) * 10 : Math.max(0, Math.floor(minimum - padding))
  const ceiling = isBloodPressure && values.length ? Math.ceil((maximum + padding) / 10) * 10 : Math.ceil(maximum + padding)
  const plotted = points.flatMap((record, index) => {
    const value = record[field]
    if (typeof value !== 'number') return []
    const x = points.length < 2 ? 270 : 30 + index * (500 / (points.length - 1))
    const y = 150 - ((value - floor) / (ceiling - floor)) * 132
    return [{ x, y, value, date: record.recordedAt }]
  })
  return <Card className={`metric-chart-card metric-chart-${field}`}>
    <div className="metric-chart-heading"><div><h2>{title}</h2><small>Daily observations · {unit}</small></div><span>{points.length} {points.length === 1 ? 'record' : 'records'}</span></div>
    {plotted.length === 0 ? <div className="chart-empty-state">No recorded data in this period. Missing values are not plotted as zero.</div> : <>
      <div className="metric-chart-wrap"><div className="metric-axis-labels"><span>{ceiling.toFixed(isBloodPressure ? 0 : 1)}</span><span>{((ceiling + floor) / 2).toFixed(isBloodPressure ? 0 : 1)}</span><span>{floor}</span></div>
        <svg className="metric-chart" viewBox="0 0 540 175" role="img" aria-label={`${title} observations over ${range === 'MISSION' ? 'the mission' : range}`}>
          <g className="chart-grid"><path d="M30 18H530M30 84H530M30 150H530"/><path d="M30 18V150M155 18V150M280 18V150M405 18V150M530 18V150"/></g>
          {plotted.length > 1 && <polyline className="metric-line" points={plotted.map(point => `${point.x},${point.y}`).join(' ')}/>}
          {plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="4.5"><title>{`${formatDateTime(point.date)}: ${point.value} ${unit}`}</title></circle>)}
        </svg>
        <div className="metric-x-labels"><span>{formatDate(plotted[0].date)}</span>{plotted.length > 2 && <span>{formatDate(plotted[Math.floor(plotted.length / 2)].date)}</span>}<span>{formatDate(plotted[plotted.length - 1].date)}</span></div>
      </div>
      <div className="metric-chart-footer"><span>Scale derived from visible values</span><span>{points.length} plotted</span></div>
    </>}
  </Card>
}

function DailyTlxChart({ records, range }: { records: CheckIn[]; range: TrendRange }) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range !== 'MISSION') start.setDate(start.getDate() - (range === '7D' ? 6 : range === '15D' ? 14 : 29))
  const points = records.flatMap(record => {
    if (!record.dailyTlxRatings || range !== 'MISSION' && Date.parse(record.recordedAt) < start.getTime()) return []
    const ratings = Object.values(record.dailyTlxRatings)
    return [{ date: record.recordedAt, value: ratings.reduce((sum, value) => sum + value, 0) / ratings.length }]
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const plotted = points.map((point, index) => ({
    ...point,
    x: points.length < 2 ? 270 : 30 + index * (500 / (points.length - 1)),
    y: 150 - point.value * 1.32,
  }))

  return <Card className="metric-chart-card metric-chart-daily-tlx">
    <div className="metric-chart-heading"><div><h2>Daily NASA-TLX workload</h2><small>Mean of six self-reported ratings · 0–100</small></div><span>{points.length} {points.length === 1 ? 'record' : 'records'}</span></div>
    {!plotted.length ? <div className="chart-empty-state">No completed daily NASA-TLX questionnaires in this period.</div> : <>
      <div className="metric-chart-wrap"><div className="metric-axis-labels"><span>100</span><span>50</span><span>0</span></div>
        <svg className="metric-chart" viewBox="0 0 540 175" role="img" aria-label={`Daily NASA-TLX workload over ${range === 'MISSION' ? 'the mission' : range}`}>
          <g className="chart-grid"><path d="M30 18H530M30 84H530M30 150H530"/><path d="M30 18V150M155 18V150M280 18V150M405 18V150M530 18V150"/></g>
          {plotted.length > 1 && <polyline className="metric-line" points={plotted.map(point => `${point.x},${point.y}`).join(' ')}/>}
          {plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="4.5"><title>{`${formatDateTime(point.date)}: ${point.value.toFixed(1)}/100`}</title></circle>)}
        </svg>
        <div className="metric-x-labels"><span>{formatDate(plotted[0].date)}</span>{plotted.length > 2 && <span>{formatDate(plotted[Math.floor(plotted.length / 2)].date)}</span>}<span>{formatDate(plotted[plotted.length - 1].date)}</span></div>
      </div>
      <div className="metric-chart-footer"><span>Descriptive self-report, not a medical threshold</span><span>{points.length} plotted</span></div>
    </>}
  </Card>
}

function PracticeScoreChart({ activities, range }: { activities: GameActivity[]; range: TrendRange }) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range !== 'MISSION') start.setDate(start.getDate() - (range === '7D' ? 6 : range === '15D' ? 14 : 29))
  const points = activities.flatMap(activity => {
    if (range !== 'MISSION' && Date.parse(activity.recordedAt) < start.getTime()) return []
    const score = typeof activity.metrics.scoreOutOf10 === 'number'
      ? activity.metrics.scoreOutOf10
      : typeof activity.metrics.finalScore === 'number'
        ? activity.metrics.finalScore / 10
        : null
    return score === null || score < 0 || score > 10 ? [] : [{ date: activity.recordedAt, game: activity.game, value: score }]
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const plotted = points.map((point, index) => ({
    ...point,
    x: points.length < 2 ? 270 : 30 + index * (500 / (points.length - 1)),
    y: 150 - point.value * 13.2,
  }))

  return <Card className="metric-chart-card metric-chart-practice-score">
    <div className="metric-chart-heading"><div><h2>Rehabilitation practice score</h2><small>Game feedback · out of 10</small></div><span>{points.length} {points.length === 1 ? 'run' : 'runs'}</span></div>
    {!plotted.length ? <div className="chart-empty-state">No completed game scores in this period.</div> : <>
      <div className="metric-chart-wrap"><div className="metric-axis-labels"><span>10</span><span>5</span><span>0</span></div>
        <svg className="metric-chart" viewBox="0 0 540 175" role="img" aria-label={`Rehabilitation practice scores over ${range === 'MISSION' ? 'the mission' : range}`}>
          <g className="chart-grid"><path d="M30 18H530M30 84H530M30 150H530"/><path d="M30 18V150M155 18V150M280 18V150M405 18V150M530 18V150"/></g>
          {plotted.length > 1 && <polyline className="metric-line" points={plotted.map(point => `${point.x},${point.y}`).join(' ')}/>}
          {plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="4.5"><title>{`${point.game} · ${formatDateTime(point.date)}: ${point.value.toFixed(1)}/10`}</title></circle>)}
        </svg>
        <div className="metric-x-labels"><span>{formatDate(plotted[0].date)}</span>{plotted.length > 2 && <span>{formatDate(plotted[Math.floor(plotted.length / 2)].date)}</span>}<span>{formatDate(plotted[plotted.length - 1].date)}</span></div>
      </div>
      <div className="metric-chart-footer"><span>Practice feedback, not a cognitive assessment</span><span>{points.length} plotted</span></div>
    </>}
  </Card>
}

function PracticeVolumeChart({ activities, range }: { activities: GameActivity[]; range: TrendRange }) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range !== 'MISSION') start.setDate(start.getDate() - (range === '7D' ? 6 : range === '15D' ? 14 : 29))
  const dailyCounts = new Map<string, number>()
  activities.forEach(activity => {
    if (range !== 'MISSION' && Date.parse(activity.recordedAt) < start.getTime()) return
    dailyCounts.set(activity.missionDate, (dailyCounts.get(activity.missionDate) ?? 0) + 1)
  })
  const points = [...dailyCounts.entries()].sort(([first], [second]) => first.localeCompare(second))
  const topScale = Math.max(1, Math.ceil(Math.max(0, ...points.map(([, count]) => count)) / 5) * 5)
  const plotted = points.map(([date, value], index) => ({
    date,
    value,
    x: points.length < 2 ? 270 : 30 + index * (500 / (points.length - 1)),
    y: 150 - value / topScale * 132,
  }))
  const totalRuns = plotted.reduce((sum, point) => sum + point.value, 0)

  return <Card className="metric-chart-card metric-chart-practice-volume">
    <div className="metric-chart-heading"><div><h2>Rehabilitation practice sessions</h2><small>Completed games per day</small></div><span>{points.length} {points.length === 1 ? 'day' : 'days'}</span></div>
    {!plotted.length ? <div className="chart-empty-state">No completed practice sessions in this period.</div> : <>
      <div className="metric-chart-wrap"><div className="metric-axis-labels"><span>{topScale}</span><span>{Math.round(topScale / 2)}</span><span>0</span></div>
        <svg className="metric-chart" viewBox="0 0 540 175" role="img" aria-label={`Completed rehabilitation practice sessions per day over ${range === 'MISSION' ? 'the mission' : range}`}>
          <g className="chart-grid"><path d="M30 18H530M30 84H530M30 150H530"/><path d="M30 18V150M155 18V150M280 18V150M405 18V150M530 18V150"/></g>
          {plotted.length > 1 && <polyline className="metric-line" points={plotted.map(point => `${point.x},${point.y}`).join(' ')}/>}
          {plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="4.5"><title>{`${formatDate(`${point.date}T12:00:00`)}: ${point.value} sessions`}</title></circle>)}
        </svg>
        <div className="metric-x-labels"><span>{formatDate(`${plotted[0].date}T12:00:00`)}</span>{plotted.length > 2 && <span>{formatDate(`${plotted[Math.floor(plotted.length / 2)].date}T12:00:00`)}</span>}<span>{formatDate(`${plotted[plotted.length - 1].date}T12:00:00`)}</span></div>
      </div>
      <div className="metric-chart-footer"><span>Practice volume, not a health measure</span><span>{totalRuns} runs in range</span></div>
    </>}
  </Card>
}

function CheckInHistory({ records }: { records: CheckIn[] }) {
  const orderedRecords = [...records].sort(compareCheckInRecency)
  const pageSize = 10
  const [page, setPage] = useState(0)
  const pageCount = Math.ceil(orderedRecords.length / pageSize)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const firstRecord = currentPage * pageSize
  const pageRecords = orderedRecords.slice(firstRecord, firstRecord + pageSize)
  const lastRecord = firstRecord + pageRecords.length

  useEffect(() => setPage(0), [records.length])

  return <Card className="checkin-history-card">
    <div className="card-heading"><div><h2>Previous check-ins</h2><p>Saved observations, newest first. Unavailable readings are explicitly marked “Not measured.”</p></div><span>{records.length} records</span></div>
    {orderedRecords.length ? <>
      <div className="assessment-pagination checkin-history-pagination" aria-label="Previous check-in pages"><span aria-live="polite">Showing {firstRecord + 1}–{lastRecord} of {orderedRecords.length} · Newest first</span><div className="assessment-page-controls"><button type="button" className="quiet-button" aria-label="Newer check-ins" title="Newer check-ins" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true"/></button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" className="quiet-button" aria-label="Older check-ins" title="Older check-ins" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight aria-hidden="true"/></button></div></div>
      <div className="checkin-history-scroll"><table className="checkin-history-table">
      <thead><tr><th>Date</th><th>Sleep</th><th>Stress</th><th>Workload</th><th>Resting HR</th><th>Blood pressure</th><th>Daily NASA-TLX</th><th>Precision</th><th>Reaction</th><th>Attention</th><th>Source</th></tr></thead>
      <tbody>{pageRecords.map(record => <tr key={record.id}>
        <td>{formatDateTime(record.recordedAt)}</td>
        <td>{record.sleepHours === null ? 'Not measured' : `${record.sleepHours.toFixed(1)} h`}</td>
        <td>{record.stress === null ? 'Not measured' : `${record.stress}/10`}</td>
        <td>{record.currentWorkload === null ? 'Not measured' : `${record.currentWorkload}/100`}</td>
        <td>{record.restingHeartRate === null ? 'Not measured' : `${record.restingHeartRate} bpm`}</td>
        <td>{record.bloodPressureSystolic === null || record.bloodPressureDiastolic === null ? 'Not measured' : `${record.bloodPressureSystolic}/${record.bloodPressureDiastolic}`}</td>
        <td>{record.dailyTlxRatings ? `${(Object.values(record.dailyTlxRatings).reduce((sum, value) => sum + value, 0) / 6).toFixed(1)}/100` : 'Not measured'}</td>
        <td>{record.rehabilitationPrecisionPercent === null ? 'Not measured' : `${record.rehabilitationPrecisionPercent}%`}</td>
        <td>{record.rehabilitationReactionMs === null ? 'Not measured' : `${record.rehabilitationReactionMs} ms`}</td>
        <td>{record.rehabilitationAttentionPercent === null ? 'Not measured' : `${record.rehabilitationAttentionPercent}%`}</td>
        <td><ProvenanceLabel source={record.source}/></td>
      </tr>)}</tbody>
      </table></div>
    </> : <p className="empty-workflow-state">No check-ins recorded yet. Add one from the dashboard.</p>}
  </Card>
}

function CheckInDialog({ onSave, onDismiss, error, required = false }: {
  onSave: (checkIn: CheckIn) => boolean
  onDismiss?: (status: CheckInDisposition['status']) => void
  error: string
  required?: boolean
}) {
  const [sleep, setSleep] = useState('')
  const [stress, setStress] = useState('')
  const [workload, setWorkload] = useState('')
  const [heartRate, setHeartRate] = useState('')
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [measurementStatus, setMeasurementStatus] = useState<Record<'sleep' | 'stress' | 'workload' | 'heartRate' | 'bloodPressure', '' | 'measured' | 'not-measured'>>({
    sleep: '',
    stress: '',
    workload: '',
    heartRate: '',
    bloodPressure: '',
  })
  const [recordedAt, setRecordedAt] = useState(localDateTimeValue)
  const [dailyTlx, setDailyTlx] = useState<Record<keyof TlxRatings, string>>({
    mentalDemand: '',
    physicalDemand: '',
    temporalDemand: '',
    performance: '',
    effort: '',
    frustration: '',
  })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const fields = [
      { key: 'sleep' as const, name: 'Sleep duration', value: sleep, min: 0, max: 24, step: 0.25 },
      { key: 'stress' as const, name: 'Self-reported stress', value: stress, min: 1, max: 10, step: 1 },
      { key: 'workload' as const, name: 'Current workload', value: workload, min: 0, max: 100, step: 1 },
      { key: 'heartRate' as const, name: 'Resting heart rate', value: heartRate, min: 30, max: 220, step: 1 },
    ]
    if (Object.values(measurementStatus).some(status => status === '')) {
      setFormError('Choose Measured or Not measured for each health field before continuing.')
      return
    }
    for (const field of fields) {
      if (measurementStatus[field.key] === 'measured' && field.value === '') {
        setFormError(`${field.name} needs a reading, or choose Not measured.`)
        return
      }
      if (field.value === '') continue
      const number = Number(field.value)
      if (!Number.isFinite(number) || number < field.min || number > field.max || (number - field.min) / field.step % 1 !== 0) {
        setFormError(`${field.name} is outside the allowed range or step.`)
        return
      }
    }
    if (Object.values(dailyTlx).some(value => value === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      setFormError('Complete all six required NASA-TLX ratings with whole numbers from 0 to 100.')
      return
    }
    if (measurementStatus.bloodPressure === 'measured' && (!systolic || !diastolic)) {
      setFormError('Enter both blood-pressure values, or choose Not measured.')
      return
    }
    if (!recordedAt || !Number.isFinite(Date.parse(recordedAt))) {
      setFormError('Enter a valid observation timestamp.')
      return
    }
    setSaving(true)
    const optionalNumber = (value: string) => value === '' ? null : Number(value)
    const saved = onSave({
      id: `checkin-${crypto.randomUUID()}`,
      recordedAt: new Date(recordedAt).toISOString(),
      source: 'participant-entered',
      sleepHours: optionalNumber(sleep),
      stress: optionalNumber(stress),
      currentWorkload: optionalNumber(workload),
      restingHeartRate: optionalNumber(heartRate),
      bloodPressureSystolic: optionalNumber(systolic),
      bloodPressureDiastolic: optionalNumber(diastolic),
      rehabilitationPrecisionPercent: null,
      rehabilitationReactionMs: null,
      rehabilitationAttentionPercent: null,
      dailyTlxRatings: Object.fromEntries(Object.entries(dailyTlx).map(([key, value]) => [key, Number(value)])) as TlxRatings,
      notMeasuredFields: [
        ...(measurementStatus.sleep === 'not-measured' ? ['sleepHours'] : []),
        ...(measurementStatus.stress === 'not-measured' ? ['stress'] : []),
        ...(measurementStatus.workload === 'not-measured' ? ['currentWorkload'] : []),
        ...(measurementStatus.heartRate === 'not-measured' ? ['restingHeartRate'] : []),
        ...(measurementStatus.bloodPressure === 'not-measured' ? ['bloodPressureSystolic', 'bloodPressureDiastolic'] : []),
      ],
      sourceDetail: '',
      context: '',
      notes: '',
    })
    if (!saved) {
      setSaving(false)
      setFormError(error || 'The check-in was not saved. Your answers remain in this form.')
    }
  }

  return <div className="popup-backdrop"><section className="checkin-dialog" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
    <div className="checkin-dialog-heading"><span className="high-alert-label"><AlertTriangle/> {required ? 'DAILY CHECK-IN REQUIRED' : 'PERSONAL CHECK-IN'}</span>{!required && onDismiss && <button className="popup-close" onClick={() => onDismiss('deferred')} aria-label="Remind me later">×</button>}</div>
    <h2 id="checkin-title">Record today&apos;s observations</h2>
    <p>{required ? 'Complete this daily check-in to enter the dashboard. For each health field, enter a reading or explicitly choose Not measured. All six daily NASA-TLX ratings are required.' : 'Participant-entered measurements are shown separately from the NYMPHA dataset. Address every health field and complete all six daily NASA-TLX ratings.'}</p>
    <form className="checkin-form" onSubmit={submit}>
      <div className="checkin-fields">
        <label>Sleep duration (hours)<select required value={measurementStatus.sleep} onChange={event => { const status = event.target.value as typeof measurementStatus.sleep; setMeasurementStatus(current => ({ ...current, sleep: status })); if (status !== 'measured') setSleep('') }}><option value="">Choose status</option><option value="measured">Measured</option><option value="not-measured">Not measured</option></select>{measurementStatus.sleep === 'measured' && <input type="number" min="0" max="24" step="0.25" required value={sleep} onChange={event => setSleep(event.target.value)} placeholder="e.g. 6.5"/>}</label>
        <label>Self-reported stress (1–10)<select required value={measurementStatus.stress} onChange={event => { const status = event.target.value as typeof measurementStatus.stress; setMeasurementStatus(current => ({ ...current, stress: status })); if (status !== 'measured') setStress('') }}><option value="">Choose status</option><option value="measured">Measured</option><option value="not-measured">Not measured</option></select>{measurementStatus.stress === 'measured' && <input type="number" min="1" max="10" step="1" required value={stress} onChange={event => setStress(event.target.value)} placeholder="1 to 10"/>}</label>
        <label>Current workload (0–100)<select required value={measurementStatus.workload} onChange={event => { const status = event.target.value as typeof measurementStatus.workload; setMeasurementStatus(current => ({ ...current, workload: status })); if (status !== 'measured') setWorkload('') }}><option value="">Choose status</option><option value="measured">Measured</option><option value="not-measured">Not measured</option></select>{measurementStatus.workload === 'measured' && <input type="number" min="0" max="100" step="1" required value={workload} onChange={event => setWorkload(event.target.value)} placeholder="Separate from NASA-TLX"/>}</label>
        <label>Resting heart rate (bpm)<select required value={measurementStatus.heartRate} onChange={event => { const status = event.target.value as typeof measurementStatus.heartRate; setMeasurementStatus(current => ({ ...current, heartRate: status })); if (status !== 'measured') setHeartRate('') }}><option value="">Choose status</option><option value="measured">Measured</option><option value="not-measured">Not measured</option></select>{measurementStatus.heartRate === 'measured' && <input type="number" min="30" max="220" step="1" required value={heartRate} onChange={event => setHeartRate(event.target.value)} placeholder="bpm"/>}</label>
        <div className="blood-pressure-fields"><label>Blood pressure status<select required value={measurementStatus.bloodPressure} onChange={event => { const status = event.target.value as typeof measurementStatus.bloodPressure; setMeasurementStatus(current => ({ ...current, bloodPressure: status })); if (status !== 'measured') { setSystolic(''); setDiastolic('') } }}><option value="">Choose status</option><option value="measured">Measured</option><option value="not-measured">Not measured</option></select></label>{measurementStatus.bloodPressure === 'measured' && <><label>Systolic<input type="number" min="40" max="300" step="1" required value={systolic} onChange={event => setSystolic(event.target.value)} placeholder="mmHg"/></label><label>Diastolic<input type="number" min="20" max="200" step="1" required value={diastolic} onChange={event => setDiastolic(event.target.value)} placeholder="mmHg"/></label></>}</div>
        <label>Observation timestamp<input type="datetime-local" required value={recordedAt} onChange={event => setRecordedAt(event.target.value)}/></label>
      </div>
      <details className="daily-tlx-details" open>
        <summary>Daily NASA-TLX workload questionnaire · required</summary>
        <p>Complete each rating from 0 to 100. This is a self-report of perceived workload, not a medical measure.</p>
        <div className="tlx-rating-grid">{dimensionInfo.map(({ key, label, endpoints }) => <label key={key}>{label}<small>{endpoints}</small><div className="tlx-input-pair"><input type="range" min="0" max="100" step="1" value={dailyTlx[key] === '' ? 0 : dailyTlx[key]} onChange={event => setDailyTlx(current => ({ ...current, [key]: event.target.value }))} aria-label={`${label} slider`}/><input type="number" min="0" max="100" step="1" required value={dailyTlx[key]} onChange={event => setDailyTlx(current => ({ ...current, [key]: event.target.value }))} placeholder="0–100"/></div></label>)}</div>
      </details>
      {(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}
      <div className="checkin-form-footer">{!required && onDismiss && <><button type="button" className="quiet-button" onClick={() => onDismiss('skipped')} disabled={saving}>Skip today</button><button type="button" className="quiet-button" onClick={() => onDismiss('deferred')} disabled={saving}>Remind me later</button></>}<button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : required ? 'Complete daily check-in' : 'Save check-in'}</button></div>
    </form>
    <small className="checkin-demo-caption">Demo readings are optional; enter them if you want, or choose “Not measured” to leave them blank.</small>
  </section></div>
}

function TlxPanel({ sessions, assessments, selectedSessionId, onSelectSession, onSave }: {
  sessions: TaskSession[]
  assessments: TlxAssessment[]
  selectedSessionId: string
  onSelectSession: (id: string) => void
  onSave: (assessment: TlxAssessment) => boolean
}) {
  const pageSize = 30
  const [ratings, setRatings] = useState<Record<keyof TlxRatings, string>>({ mentalDemand: '', physicalDemand: '', temporalDemand: '', performance: '', effort: '', frustration: '' })
  const [weighted, setWeighted] = useState(false)
  const [choices, setChoices] = useState<Record<string, keyof TlxRatings>>({})
  const [formError, setFormError] = useState('')
  const [assessmentPage, setAssessmentPage] = useState(0)
  const sortedAssessments = [...assessments].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
  const pageCount = Math.ceil(sortedAssessments.length / pageSize)
  const currentPage = Math.min(assessmentPage, Math.max(0, pageCount - 1))
  const firstAssessment = currentPage * pageSize
  const pageAssessments = sortedAssessments.slice(firstAssessment, firstAssessment + pageSize)
  const lastAssessment = firstAssessment + pageAssessments.length
  const eligible = [...sessions].filter(session => !assessments.some(assessment => assessment.sessionId === session.id)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
  const selected = eligible.find(session => session.id === selectedSessionId) ?? eligible[0]
  const rawScore = dimensionKeys.every(key => ratings[key] !== '') ? Number((dimensionKeys.reduce((sum, key) => sum + Number(ratings[key]), 0) / 6).toFixed(1)) : null
  const weights = dimensionKeys.reduce((result, key) => ({ ...result, [key]: 0 }), {} as Record<keyof TlxRatings, number>)
  Object.values(choices).forEach(key => { weights[key] += 1 })
  const weightedScore = weighted && rawScore !== null && comparisons.every((_, index) => choices[String(index)])
    ? Number((dimensionKeys.reduce((sum, key) => sum + weights[key] * Number(ratings[key]), 0) / 15).toFixed(1))
    : null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const parsed = Object.fromEntries(dimensionKeys.map(key => [key, Number(ratings[key])])) as TlxRatings
    if (dimensionKeys.some(key => ratings[key] === '' || !Number.isInteger(parsed[key]) || parsed[key] < 0 || parsed[key] > 100)) {
      setFormError('Enter all six dimensions as exact integers from 0 to 100.')
      return
    }
    if (weighted && comparisons.some((_, index) => !choices[String(index)])) {
      setFormError('Complete all 15 pairwise comparisons or turn off Weighted TLX.')
      return
    }
    const pairwiseComparisons = weighted ? comparisons.map((pair, index) => ({ ...pair, selected: choices[String(index)] })) : null
    const assessment: TlxAssessment = {
      id: `tlx-${crypto.randomUUID()}`,
      sessionId: selected.id,
      recordedAt: new Date().toISOString(),
      source: 'participant-entered',
      ratings: parsed,
      rawScore: Number((dimensionKeys.reduce((sum, key) => sum + parsed[key], 0) / 6).toFixed(1)),
      pairwiseComparisons,
      weightedScore: weighted ? Number((dimensionKeys.reduce((sum, key) => sum + weights[key] * parsed[key], 0) / 15).toFixed(1)) : null,
      weights: weighted ? weights : null,
    }
    if (onSave(assessment)) {
      setRatings({ mentalDemand: '', physicalDemand: '', temporalDemand: '', performance: '', effort: '', frustration: '' })
      setChoices({})
      setFormError('')
      setAssessmentPage(0)
    } else setFormError('The assessment was not saved. Your ratings remain in the form.')
  }

  return <section className="workflow-page">
    <div className="workflow-heading"><div><h2></h2><p></p></div></div>
    {selected ? <Card className="workflow-card"><div className="linked-session-note"><strong>Linked task session</strong><span>{selected.game === 'signal-match' ? 'Signal Match' : 'Orbital Supply Catch'} · {formatDateTime(selected.completedAt)} · ID {selected.id}</span></div>
      {eligible.length > 1 && <label className="session-select-label">Choose an unassessed session<select value={selected.id} onChange={event => onSelectSession(event.target.value)}>{eligible.map(session => <option key={session.id} value={session.id}>{session.game} · {formatDateTime(session.completedAt)}</option>)}</select></label>}
      <form className="tlx-form" onSubmit={submit}><div className="tlx-rating-grid">{dimensionInfo.map(({ key, label, endpoints }) => <label key={key}>{label}<small>{endpoints}</small><div className="tlx-input-pair"><input type="range" min="0" max="100" step="1" value={ratings[key] === '' ? 0 : ratings[key]} onChange={event => setRatings(current => ({ ...current, [key]: event.target.value }))} aria-label={`${label} slider`}/><input type="number" min="0" max="100" step="1" required value={ratings[key]} onChange={event => setRatings(current => ({ ...current, [key]: event.target.value }))} placeholder="0–100"/></div></label>)}</div>
        <label className="weighted-toggle"><input type="checkbox" checked={weighted} onChange={event => { setWeighted(event.target.checked); setChoices({}) }}/> Calculate optional Weighted TLX using 15 pairwise comparisons</label>
        {weighted && <div className="pairwise-grid">{comparisons.map(({ first, second }, index) => <label key={`${first}-${second}`}>{dimensionInfo.find(item => item.key === first)?.label} vs {dimensionInfo.find(item => item.key === second)?.label}<select required value={choices[String(index)] ?? ''} onChange={event => setChoices(current => ({ ...current, [String(index)]: event.target.value as keyof TlxRatings }))}><option value="">Select greater contributor</option><option value={first}>{dimensionInfo.find(item => item.key === first)?.label}</option><option value={second}>{dimensionInfo.find(item => item.key === second)?.label}</option></select></label>)}</div>}
        <div className="tlx-live-scores"><span>Raw TLX: {rawScore === null ? 'Awaiting all six ratings' : rawScore.toFixed(1)}</span>{weighted && <span>Weighted TLX: {weightedScore === null ? 'Complete all comparisons' : weightedScore.toFixed(1)}</span>}</div>
        {formError && <p className="form-error" role="alert">{formError}</p>}<p className="tlx-method-note">Raw TLX = exact mean of six ratings, rounded to one decimal. Weighted TLX = sum of rating × comparison weight ÷ 15. These are descriptive workload scores, not medical thresholds.</p><button className="primary-button" type="submit">Save linked NASA-TLX assessment</button>
      </form>
    </Card> : <Card className="workflow-card"><h3>NASA TLX : Sourced from NASA</h3><p>In Halo AI TLX assessments are used to find the weightage of tasks on the cognitive abilites of Dr. Yuki Tanaka</p></Card>}
    {assessments.length > 0 && <Card className="saved-assessments-card"><div className="saved-assessments-heading"><h3>Saved assessments</h3><span>{sortedAssessments.length} total</span></div><div className="assessment-pagination" aria-label="Saved assessment pages"><span aria-live="polite">Showing {firstAssessment + 1}–{lastAssessment} of {sortedAssessments.length} · Newest first</span><div className="assessment-page-controls"><button type="button" className="quiet-button" aria-label="Newer assessments" title="Newer assessments" disabled={currentPage === 0} onClick={() => setAssessmentPage(currentPage - 1)}><ChevronLeft aria-hidden="true"/></button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" className="quiet-button" aria-label="Older assessments" title="Older assessments" disabled={currentPage >= pageCount - 1} onClick={() => setAssessmentPage(currentPage + 1)}><ChevronRight aria-hidden="true"/></button></div></div>{pageAssessments.map(item => <div className="saved-assessment-row" key={item.id}><div><b>Raw TLX {item.rawScore.toFixed(1)}{item.weightedScore !== null ? ` · Weighted TLX ${item.weightedScore.toFixed(1)}` : ''}</b><span>{formatDateTime(item.recordedAt)} · {item.sessionId}</span></div><ProvenanceLabel source={item.source}/></div>)}</Card>}
  </section>
}

export function HaloDashboard() {
  const [active, setActive] = useState('Dashboard')
  const [data, setData] = useState<HaloData | null>(null)
  const dataRef = useRef<HaloData | null>(null)
  const encryptedFileInputRef = useRef<HTMLInputElement>(null)
  const [storageError, setStorageError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [encryptedAction, setEncryptedAction] = useState<'encrypt' | 'decrypt' | null>(null)
  const [encryptionPassphrase, setEncryptionPassphrase] = useState('')
  const [passphraseConfirmation, setPassphraseConfirmation] = useState('')
  const [encryptedFileToUnlock, setEncryptedFileToUnlock] = useState<File | null>(null)
  const [manualCheckInOpen, setManualCheckInOpen] = useState(false)
  const [requiredCheckInOpen, setRequiredCheckInOpen] = useState(false)
  const [pendingGameActivityId, setPendingGameActivityId] = useState<string | null>(null)
  const [workflowGameActivityId, setWorkflowGameActivityId] = useState<string | null>(null)
  const [recommendedExerciseId, setRecommendedExerciseId] = useState<number | null>(null)
  const [requiredGameDate, setRequiredGameDate] = useState<string | null>(null)
  const [dailyGameRequired, setDailyGameRequired] = useState(false)
  const [workflowStage, setWorkflowStage] = useState<'check-in' | 'game'>('check-in')
  const [checkInError, setCheckInError] = useState('')
  const [range, setRange] = useState<TrendRange>('15D')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const today = localDateKey(new Date())
  const showCheckIn = requiredCheckInOpen || manualCheckInOpen
  const focusedPage = ['Astronaut Details', 'Yuki AI', 'Features', 'Measurements', 'ML Patterns', 'Research Library', 'Belonging', 'Settings'].includes(active)

  function saveData(next: HaloData) {
    dataRef.current = next
    setData(next)
    setStorageError('')
    return true
  }

  useEffect(() => {
    let cleanupError = ''
    try {
      const oldHaloKeys = Object.keys(window.localStorage).filter(key => (
        key === 'halo.localDemoData.v1'
        || key === 'halo.backendUrl.v1'
        || key === 'halo.syntheticDemoDismissed.v1'
        || key.startsWith('halo.osdrCache.v1.')
      ))
      oldHaloKeys.forEach(key => window.localStorage.removeItem(key))
    } catch (reason) {
      cleanupError = reason instanceof Error ? reason.message : 'Browser storage cleanup was blocked.'
    }
    const initialData = createJudgeDemoData()
    dataRef.current = initialData
    setData(initialData)
    setRequiredCheckInOpen(true)
    if (new URLSearchParams(window.location.search).get('page') === 'yuki') setActive('Yuki AI')
    if (cleanupError) setStorageError(`A fresh in-memory session started, but old HALO browser data could not be cleared: ${cleanupError}`)
  }, [])

  function navigateTo(page: string) {
    if (page === 'Measurements' && data && !data.reviewedTrendDates.includes(today)) {
      saveData({ ...data, reviewedTrendDates: [...data.reviewedTrendDates, today] })
    }
    setActive(page)
  }

  function openYukiChat() {
    if (dailyGameRequired) return
    setWelcomeOpen(false)
    setActive('Yuki AI')
    window.setTimeout(() => {
      document.getElementById('yuki-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      document.getElementById('yuki-mission-analysis-prompt')?.click()
      document.getElementById('yuki-chat-input')?.focus()
    }, 50)
  }

  function saveCheckIn(item: CheckIn) {
    if (!data) return false
    const itemDay = localDateKey(new Date(item.recordedAt))
    if (data.checkIns.some(record => record.source === 'participant-entered' && localDateKey(new Date(record.recordedAt)) === itemDay)) {
      setCheckInError('A participant check-in is already saved for that date.')
      return false
    }
    const saved = saveData({ ...data, checkIns: [...data.checkIns, item], checkInDisposition: null })
    if (saved) {
      setManualCheckInOpen(false)
      setRequiredCheckInOpen(false)
      setWorkflowStage('check-in')
      setWorkflowGameActivityId(null)
      setRequiredGameDate(today)
      setDailyGameRequired(true)
      setWelcomeOpen(true)
      setCheckInError('')
    } else setCheckInError(storageError)
    return saved
  }

  function dismissCheckIn(status: CheckInDisposition['status']) {
    if (!data) return
    if (saveData({ ...data, checkInDisposition: { date: today, status } })) {
      setManualCheckInOpen(false)
      setCheckInError('')
    } else setCheckInError(storageError)
  }

  function saveAssessment(assessment: TlxAssessment) {
    if (!data || data.tlxAssessments.some(item => item.sessionId === assessment.sessionId)) return false
    return saveData({ ...data, tlxAssessments: [...data.tlxAssessments, assessment] })
  }

  function pinReference(reference: Omit<ResearchReference, 'id'>) {
    if (!data || data.researchReferences.some(item => item.accession === reference.accession)) return
    saveData({ ...data, researchReferences: [...data.researchReferences, { ...reference, id: `osdr-${crypto.randomUUID()}` }] })
  }

  function saveGameActivity(summary: YukiGameAnalysis): GameActivity | null {
    const currentData = dataRef.current
    if (!currentData) return null
    const missionDate = localDateKey(new Date(summary.recordedAt))
    const missionDates = [...new Set(currentData.checkIns.map(item => localDateKey(new Date(item.recordedAt))))].sort()
    const missionDay = missionDates.indexOf(missionDate)
    const activity: GameActivity = {
      ...summary,
      missionDate,
      missionDay: missionDay < 0 ? null : missionDay + 1,
      source: 'participant-entered',
    }
    const gameActivities = [...currentData.gameActivities.filter(item => item.id !== activity.id), activity]
    return saveData({ ...currentData, gameActivities }) ? activity : null
  }

  function getRecentPracticeOptions() {
    if (!data) return []
    const dates = [...new Set([
      ...data.checkIns.map(item => localDateKey(new Date(item.recordedAt))),
      ...data.gameActivities.map(item => item.missionDate),
    ])].sort()
    const recentDates = new Set(dates.slice(-15))
    return recommendPracticeGames(data.gameActivities.filter(item => recentDates.has(item.missionDate)))
  }

  function analyzeGameActivity(id: string) {
    if (dailyGameRequired) {
      setWorkflowStage('check-in')
      setWelcomeOpen(true)
      return
    }
    setWelcomeOpen(false)
    setPendingGameActivityId(id)
    setActive('Yuki AI')
  }

  function startRecommendedGame(exerciseId?: number) {
    const recommendations = getRecentPracticeOptions()
    const recommendation = recommendations.find(item => item.id === exerciseId) ?? recommendations[0]
    if (!recommendation) return
    setRecommendedExerciseId(recommendation.id)
    setWelcomeOpen(false)
    setActive('Cognitive Tasks')
  }

  function completeGameWorkflow(activity: GameActivity) {
    if (dailyGameRequired && activity.source === 'participant-entered' && activity.missionDate === requiredGameDate) {
      setDailyGameRequired(false)
      setRequiredGameDate(null)
    }
    setWorkflowGameActivityId(activity.id)
    setWorkflowStage('game')
    setWelcomeOpen(true)
    setRecommendedExerciseId(null)
  }

  function buildDebrief() {
    if (!data) return null
    const derivedTaskSummaries = data.taskSessions.map(session => {
      const validTimes = session.trials.flatMap(trial => trial.outcome === 'hit' && trial.reactionTimeMs !== null ? [trial.reactionTimeMs] : [])
      const sortedTimes = [...validTimes].sort((a, b) => a - b)
      const middle = Math.floor(sortedTimes.length / 2)
      const medianRt = sortedTimes.length === 0 ? null : sortedTimes.length % 2 ? sortedTimes[middle] : (sortedTimes[middle - 1] + sortedTimes[middle]) / 2
      return {
        sessionId: session.id,
        accuracyPercent: session.trials.length ? Number((session.trials.filter(trial => trial.outcome === 'hit').length / session.trials.length * 100).toFixed(1)) : null,
        meanValidReactionTimeMs: validTimes.length ? Number((validTimes.reduce((sum, value) => sum + value, 0) / validTimes.length).toFixed(1)) : null,
        medianValidReactionTimeMs: medianRt,
        omissions: session.trials.filter(trial => trial.outcome === 'omission').length,
        durationMs: session.durationMs,
      }
    })
    return {
      title: 'HALO Mission Debrief',
      exportedAt: new Date().toISOString(),
      storageMode: 'In-memory judge session; records reset on each dashboard load',
      records: data,
      derivedTaskSummaries,
      demoTrend: analyzeMissionTrend(data.checkIns),
      audit: {
        provenanceValues: ['NYMPHA record', 'Participant-entered', 'External NASA OSDR'],
        missingValues: 'Null values mean not recorded; they are not imputed as zero.',
        modelCaveat: 'Illustrative Markov transition estimates use only the last 15 generated NYMPHA data days. This is not a validated prediction, clinical severity rating, or medical assessment.',
        metricMethods: {
          rawTlx: 'Mean of six integer ratings from 0–100, rounded to one decimal.',
          weightedTlx: 'Sum of each rating multiplied by its pairwise comparison count, divided by 15.',
        },
      },
    }
  }

  function openEncryptedExport() {
    setExportError('')
    setEncryptionPassphrase('')
    setPassphraseConfirmation('')
    setEncryptedFileToUnlock(null)
    setEncryptedAction('encrypt')
  }

  function closeEncryptedAction() {
    setEncryptedAction(null)
    setEncryptionPassphrase('')
    setPassphraseConfirmation('')
    setEncryptedFileToUnlock(null)
    setExportError('')
  }

  async function submitEncryptedAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setExportError('')
    if (encryptedAction === 'encrypt' && encryptionPassphrase.length < 14) {
      setExportError('Use a passphrase with at least 14 characters.')
      return
    }
    if (encryptedAction === 'encrypt' && encryptionPassphrase !== passphraseConfirmation) {
      setExportError('The passphrases did not match. The encrypted export was not created.')
      return
    }
    if (!encryptedAction) return
    setExportBusy(true)
    try {
      if (encryptedAction === 'encrypt') {
        const debrief = buildDebrief()
        if (!debrief) throw new Error('Mission data is not ready to export.')
        const encryptedJson = await encryptJson(debrief, encryptionPassphrase)
        downloadTextFile(encryptedJson, `halo-mission-debrief-${new Date().toISOString().replace(/[:.]/g, '-')}.halo.enc.json`)
      } else {
        if (!encryptedFileToUnlock) throw new Error('Select an encrypted HALO JSON file first.')
        const decrypted = await decryptJson(await encryptedFileToUnlock.text(), encryptionPassphrase)
        const filename = encryptedFileToUnlock.name.replace(/\.halo\.enc\.json$/i, '') || 'halo-mission-debrief'
        downloadTextFile(JSON.stringify(decrypted, null, 2), `${filename}.decrypted.json`)
      }
      closeEncryptedAction()
    } catch (reason) {
      setExportError(encryptedAction === 'decrypt'
        ? 'Could not unlock the file. Check the passphrase, file format, and file integrity.'
        : reason instanceof Error ? reason.message : 'Encrypted export failed.')
    } finally {
      setExportBusy(false)
    }
  }

  function prepareEncryptedUnlock(file: File | null) {
    if (!file) return
    setExportError('')
    setEncryptionPassphrase('')
    setPassphraseConfirmation('')
    setEncryptedFileToUnlock(file)
    setEncryptedAction('decrypt')
  }

  function downloadTextFile(text: string, filename: string) {
    const blob = new Blob([text], { type: 'application/json' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const missionTrend = data ? analyzeMissionTrend(data.checkIns) : null
  const missionAlertLevel = missionTrend?.currentState === 'Higher'
    ? 'high'
    : missionTrend?.currentState === 'Rising'
      ? 'medium'
      : missionTrend?.currentState === 'Baseline'
        ? 'low'
        : 'unknown'

  if (!data) return <main className="halo-shell"><div className="storage-loading">Preparing the NYMPHA dataset…</div></main>

  return <main className={`halo-shell halo-workspace markov-${missionAlertLevel} ${focusedPage ? 'focused-view' : ''}`}>
    <div className="space-backdrop"/>
    <aside className="sidebar">
      <a className="brand" href="#dashboard" aria-label="HALO home"><span className="brand-orbit"><span/></span><span><strong>HALO</strong><small>Health · Act · Log · Observe</small></span></a>
      <nav aria-label="Main navigation">{navigation.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigateTo(label)} className={`nav-item ${active === label ? 'active' : ''}`} aria-label={label} title={label} aria-current={active === label ? 'page' : undefined}><Icon/><span>{label}</span></button>)}</nav>
      <a className="mission-archive-link" href="/mission-archive.html" aria-label="Go back to mission archive" title="Go back to mission archive"><ArrowLeft/><span>Go back to mission archive</span></a>
      <div className="sidebar-profile"><span className="avatar">Y</span><span><b>Yuki</b><small>Participant profile</small></span><span className="online-dot"/></div>
    </aside>
    <div className={`dashboard-content ${focusedPage ? 'focused-dashboard-content' : ''}`} id="dashboard">
      <header className="topbar"><div className="greeting-icon">{active === 'Yuki AI' ? <Bot/> : <Activity/>}</div><div className="greeting"><h1>{active === 'Dashboard' ? 'HALO mission overview' : active}</h1>{active === 'Yuki AI' && <p>Your HALO mission companion · Ask questions or review recent records</p>}</div></header>
      {storageError && <div className="storage-error" role="alert"><AlertTriangle/>{storageError}</div>}
      {active === 'Astronaut Details' && <section className="workflow-page astronaut-details-page" aria-label="Astronaut details">
        <Card className="astronaut-profile-hero">
          <div className="astronaut-profile-avatar" aria-label="Profile image hidden for privacy">
            <UserRound aria-hidden="true"/>
            <span>PRIVACY</span>
          </div>
          <div className="astronaut-profile-copy">
            <span className="astronaut-profile-kicker">MISSION SPECIALIST · NYMPHA</span>
            <h3>Yuki Tanaka</h3>
            <p>Fictional astronaut profile created for the HALO mission dashboard demonstration.</p>
            <div className="astronaut-profile-tags"><span>ISS mission scenario</span><span>Research participant</span></div>
          </div>
          <figure className="astronaut-city-figure">
            <img src="/belonging/tokyo-night.webp" alt="Tokyo city lights at night"/>
            <figcaption>TOKYO · JAPAN</figcaption>
          </figure>
        </Card>
        <div className="astronaut-details-grid">
          <Card className="astronaut-detail-card">
            <span className="astronaut-section-label">PERSONAL PROFILE</span>
            <h3>Personal details</h3>
            <dl className="astronaut-detail-list">
              <div><dt>Full name</dt><dd>Yuki Tanaka</dd></div>
              <div><dt>Nationality</dt><dd>Japanese</dd></div>
              <div><dt>Home district</dt><dd>Setagaya City, Tokyo, Japan</dd></div>
              <div><dt>Blood group</dt><dd>O positive (O+)</dd></div>
              <div><dt>Languages</dt><dd>Japanese · English</dd></div>
              <div><dt>Mission role</dt><dd>Mission specialist</dd></div>
            </dl>
          </Card>
          <Card className="astronaut-detail-card">
            <span className="astronaut-section-label">MISSION ASSIGNMENT</span>
            <h3>NYMPHA · ISS</h3>
            <dl className="astronaut-detail-list astronaut-mission-list">
              <div><dt>Program</dt><dd>NYMPHA research scenario</dd></div>
              <div><dt>Platform</dt><dd>International Space Station</dd></div>
              <div><dt>Research focus</dt><dd>Cognitive workload and crew wellbeing</dd></div>
            </dl>
          </Card>
          <Card className="astronaut-detail-card astronaut-support-card">
            <span className="astronaut-section-label">MISSION SUPPORT</span>
            <h3>Tools available to Yuki</h3>
            <div className="astronaut-support-grid">
              <div><b>Daily check-in</b><span>Record observations and workload ratings.</span></div>
              <div><b>Cognitive practice</b><span>Complete interactive tasks and review session feedback.</span></div>
              <div><b>Yuki AI companion</b><span>Explore mission records after completing the required daily game.</span></div>
              <div><b>Belonging experience</b><span>Take an optional visual visit through familiar places.</span></div>
            </div>
          </Card>
        </div>
        <p className="astronaut-profile-note">All profile values on this page are fictional demo information, not real astronaut, identity, or medical records.</p>
      </section>}
      {active === 'Features' && <section className="workflow-page feature-guide-page" aria-label="Yuki dashboard features">
        <div className="feature-guide-grid">{dashboardFeatures.map((feature, index) => <Card className="feature-guide-card" key={feature.title}>
          <span className="feature-guide-index">FEATURE {String(index + 1).padStart(2, '0')}</span>
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
          <button className="text-link" onClick={() => navigateTo(feature.page)}>Open {feature.page} <ArrowRight/></button>
        </Card>)}</div>
      </section>}
      {active === 'Dashboard' && <section className="dashboard-page">
        <div className="dashboard-page-heading"><div className="dashboard-quick-actions"><button className="secondary-button" onClick={() => setManualCheckInOpen(true)}>Add check-in</button><button className="secondary-button" disabled={exportBusy} onClick={openEncryptedExport}><Download/> Export encrypted JSON</button></div></div>
        <MissionTrendIndicator state={missionTrend?.currentState ?? null} index={missionTrend?.currentIndex ?? null}/>
        <div className="overview-metrics-grid">
          <DashboardMetric title="Latest sleep" unit="hours" field="sleepHours" records={data.checkIns} decimals={1}/>
          <DashboardMetric title="Latest self-reported stress" unit="/10" field="stress" records={data.checkIns}/>
          <DashboardMetric title="Current workload · separate from NASA-TLX" unit="/100" field="currentWorkload" records={data.checkIns}/>
          <DashboardMetric title="Resting heart rate" unit="bpm" field="restingHeartRate" records={data.checkIns}/>
        </div>
        <div className="dashboard-summary-grid">
          <Card className="summary-card"><span>15-day wellness proxy · experimental</span><strong>{missionTrend?.wellnessIndex?.toFixed(1) ?? '—'}</strong><button className="text-link" onClick={() => navigateTo('ML Patterns')}>View model panel <ArrowRight/></button></Card>
        </div>
        <div className="dashboard-bottom-grid">
          <Card className="recent-records-card"><div className="card-heading"><h2>Recent check-ins</h2><button className="text-link" onClick={() => navigateTo('Measurements')}>View history <ArrowRight/></button></div>{data.checkIns.length ? <div className="record-list">{[...data.checkIns].sort(compareCheckInRecency).slice(0, 5).map(record => <div className="record-row" key={record.id}><div><b>{formatDateTime(record.recordedAt)}</b><span>{record.sleepHours === null ? 'Sleep not measured' : `${record.sleepHours.toFixed(1)} h sleep`} · {record.stress === null ? 'Stress not measured' : `Stress ${record.stress}/10`}</span></div><ProvenanceLabel source={record.source}/></div>)}</div> : <p className="empty-workflow-state">No check-ins recorded.</p>}</Card>
        </div>
      </section>}
      {active === 'Measurements' && <section className="measurements-view measurements-page"><div className="measurements-intro"><h2></h2><p></p></div><div className="chart-range-switch" aria-label="History period">{(['7D', '15D', '30D', 'MISSION'] as TrendRange[]).map(item => <button key={item} className={range === item ? 'selected' : ''} aria-pressed={range === item} onClick={() => setRange(item)}>{item === 'MISSION' ? 'Mission-Wide' : `${item.slice(0, -1)} Days`}</button>)}</div><div className="metric-chart-grid">
        <MetricChart title="Sleep duration" unit="hours" field="sleepHours" records={data.checkIns} range={range}/>
        <MetricChart title="Self-reported stress" unit="/10" field="stress" records={data.checkIns} range={range}/>
        <MetricChart title="Current workload" unit="/100" field="currentWorkload" records={data.checkIns} range={range}/>
        <MetricChart title="Resting heart rate" unit="bpm" field="restingHeartRate" records={data.checkIns} range={range}/>
        <MetricChart title="Blood pressure · systolic" unit="mmHg" field="bloodPressureSystolic" records={data.checkIns} range={range}/>
        <MetricChart title="Blood pressure · diastolic" unit="mmHg" field="bloodPressureDiastolic" records={data.checkIns} range={range}/>
        <MetricChart title="Rehabilitation precision" unit="%" field="rehabilitationPrecisionPercent" records={data.checkIns} range={range}/>
        <MetricChart title="Rehabilitation reaction time" unit="ms" field="rehabilitationReactionMs" records={data.checkIns} range={range}/>
        <MetricChart title="Rehabilitation attention" unit="%" field="rehabilitationAttentionPercent" records={data.checkIns} range={range}/>
        <DailyTlxChart records={data.checkIns} range={range}/>
        <PracticeScoreChart activities={data.gameActivities} range={range}/>
        <PracticeVolumeChart activities={data.gameActivities} range={range}/>
      </div><CheckInHistory records={data.checkIns}/></section>}
      {active === 'Cognitive Tasks' && <RehabilitationPractice records={data.checkIns} activities={data.gameActivities} onSaveActivity={saveGameActivity} onAnalyzeActivity={analyzeGameActivity} onActivityComplete={completeGameWorkflow} recommendedExerciseId={recommendedExerciseId}/>}
      {active === 'NASA-TLX' && <TlxPanel sessions={data.taskSessions} assessments={data.tlxAssessments} selectedSessionId={selectedSessionId} onSelectSession={setSelectedSessionId} onSave={saveAssessment}/>}
      {active === 'ML Patterns' && <MLPatternInspector checkIns={data.checkIns}/>}
      {active === 'Research Library' && <ResearchExplorer references={data.researchReferences} onPin={pinReference}/>}
      {active === 'Belonging' && <BelongingExperience/>}
      {active === 'Settings' && <section className="workflow-page">
        <Card className="workflow-card settings-card">
          <div className="settings-export-section">
            <div><h3>Mission debrief</h3><p>Encrypted JSON exports use AES-256-GCM and a passphrase that is never saved. Unlocking creates a plaintext JSON download.</p><p className="hipaa-safeguard-notice" role="note">Some HIPAA-aligned safeguards are enabled: encrypted exports and external Groq requests off by default. This demo is not HIPAA-compliant; do not enter real health information. Production use requires approved HTTPS hosting, access and audit controls, retention policies, and required vendor agreements.</p></div>
            <div className="settings-actions">
              <button className="secondary-button" disabled={exportBusy} onClick={openEncryptedExport}><Download/> Export encrypted JSON</button>
              <button className="secondary-button" disabled={exportBusy} onClick={() => encryptedFileInputRef.current?.click()}>Unlock encrypted JSON</button>
              <input ref={encryptedFileInputRef} type="file" accept=".halo.enc.json,application/json" hidden onChange={event => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; prepareEncryptedUnlock(file) }}/>
            </div>
          </div>
        </Card>
      </section>}
      <YukiAssistant
        data={data}
        recordAnalysisAllowed={!dailyGameRequired}
        onSaveGameActivity={saveGameActivity}
        pendingGameActivityId={pendingGameActivityId}
        onPendingGameActivityHandled={() => setPendingGameActivityId(null)}
        active={active === 'Yuki AI'}
      />
      {!focusedPage && <div className="mobile-footer"><span><i className="online-dot"/> {data.checkIns.length} NYMPHA records</span><span>Resets on load</span></div>}
    </div>
    {encryptedAction && <div className="popup-backdrop"><section className="secure-export-dialog" role="dialog" aria-modal="true" aria-labelledby="secure-export-title">
      <h2 id="secure-export-title">{encryptedAction === 'encrypt' ? 'Export encrypted debrief' : 'Unlock encrypted JSON'}</h2>
      <p>{encryptedAction === 'encrypt' ? 'Create a strong passphrase. HALO will not save it; you will need it to decrypt this file.' : 'Enter the passphrase for this file. Unlocking downloads a plaintext JSON copy.'}</p>
      <form className="secure-export-form" onSubmit={event => void submitEncryptedAction(event)}>
        <label>Passphrase<input type="password" autoComplete="off" autoFocus required minLength={encryptedAction === 'encrypt' ? 14 : undefined} value={encryptionPassphrase} onChange={event => setEncryptionPassphrase(event.target.value)}/></label>
        {encryptedAction === 'encrypt' && <label>Confirm passphrase<input type="password" autoComplete="off" required minLength={14} value={passphraseConfirmation} onChange={event => setPassphraseConfirmation(event.target.value)}/></label>}
        {exportError && <p className="secure-export-error" role="alert">{exportError}</p>}
        <div className="secure-export-actions"><button className="quiet-button" type="button" disabled={exportBusy} onClick={closeEncryptedAction}>Cancel</button><button className="primary-button" type="submit" disabled={exportBusy}>{exportBusy ? 'Working…' : encryptedAction === 'encrypt' ? 'Encrypt and download' : 'Unlock and download'}</button></div>
      </form>
    </section></div>}
    {showCheckIn && <CheckInDialog onSave={saveCheckIn} onDismiss={requiredCheckInOpen ? undefined : dismissCheckIn} error={checkInError} required={requiredCheckInOpen}/>}
    {welcomeOpen && !requiredCheckInOpen && <div className="popup-backdrop demo-trend-backdrop"><section className="demo-trend-dialog mission-workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-trend-title">
      <div className="demo-trend-heading"><span className="demo-trend-label"><AlertTriangle/> DAILY MISSION STEPS</span><button className="popup-close" onClick={() => setWelcomeOpen(false)} aria-label="Close daily mission steps"><X/></button></div>
      {workflowStage === 'check-in' ? <>
        <h2 id="demo-trend-title">{dailyGameRequired ? 'Complete today’s required rehabilitation game' : 'Your check-in is saved. Continue one step at a time.'}</h2>
        <ol className="mission-workflow-steps"><li className="completed"><b>1 · Daily check-in</b><span>Health observations, explicit Not measured choices, and all six required NASA-TLX ratings saved for this session.</span></li><li className={dailyGameRequired ? 'current' : ''}><b>2 · Practice game</b><span>Complete one game in the 25-exercise portal. Its saved result is required before Yuki can analyze mission or game records.</span></li><li><b>3 · Review and choose next practice</b><span>After the required game is saved, review its score and ask Yuki to analyze recent records.</span></li></ol>
        <div className="practice-recommendation-list"><b>Practice options · based on recent game scores when available</b><p className="game-recommendation-hint">Note the title of the game(s) you choose. If a game opens in a separate tab, finish playing and close that tab to return here.</p>{getRecentPracticeOptions().map(game => <div className="practice-recommendation" key={game.id}><span><strong>#{game.id} {game.title}</strong><small>{game.domain} · {game.reason}</small></span><button className="secondary-button" onClick={() => startRecommendedGame(game.id)}>Practice</button></div>)}</div>
        {!dailyGameRequired && <div className="demo-trend-actions"><button className="secondary-button" onClick={openYukiChat}>Analyze 15 days with Yuki</button><button className="quiet-button" onClick={() => setWelcomeOpen(false)}>Continue to dashboard</button></div>}
        {dailyGameRequired && <p className="form-error" role="status">Complete and save one rehabilitation game to unlock Yuki record analysis. You can close this popup and use the sidebar tabs at any time.</p>}
        <small>Trend estimates use generated NYMPHA records; practice scores are not health measures or medical advice.</small>
      </> : <>
        {(() => {
          const activity = data.gameActivities.find(item => item.id === workflowGameActivityId)
          const recommendations = getRecentPracticeOptions()
          const score = typeof activity?.metrics.scoreOutOf10 === 'number'
            ? activity.metrics.scoreOutOf10
            : typeof activity?.metrics.finalScore === 'number'
              ? activity.metrics.finalScore / 10
              : null
          return <>
            <h2 id="demo-trend-title">Practice result recorded</h2>
            <p>{activity ? <><strong>{activity.game}</strong> · {score === null ? 'Score unavailable' : `${score.toFixed(1)}/10`} · mission day {activity.missionDay ?? 'unmapped'}.</> : 'Your result was saved to this session.'} The score is feedback from this game only.</p>
            {dailyGameRequired && <p className="form-error" role="status">Complete and save a rehabilitation game for today to unlock Yuki record analysis. You can close this popup and use the sidebar tabs at any time.</p>}
            <div className="practice-recommendation-list"><b>Next practice options</b><p className="game-recommendation-hint">Note the title of the game(s) you choose. If a game opens in a separate tab, finish playing and close that tab to return here.</p>{recommendations.map(game => <div className="practice-recommendation" key={game.id}><span><strong>#{game.id} {game.title}</strong><small>{game.domain} · {game.reason}</small></span><button className="secondary-button" onClick={() => startRecommendedGame(game.id)}>Play</button></div>)}</div>
            <div className="demo-trend-actions">{activity && !dailyGameRequired && <button className="secondary-button" onClick={() => analyzeGameActivity(activity.id)}>Analyze result and 15 days with Yuki</button>}<button className="quiet-button" onClick={() => setWelcomeOpen(false)}>Close</button></div>
            <small>Recommendations use only saved game-practice scores, not health measurements. They are optional and non-clinical.</small>
          </>
        })()}
      </>}
    </section></div>}
  </main>
}
