'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Bot, ExternalLink, FlaskConical, Gamepad2, HeartHandshake, MousePointer2, Play, Send } from 'lucide-react'
import { localDateKey, type CheckIn, type GameActivity, type GameKind, type HaloData, type ResearchReference, type TaskOutcome, type TaskSession, type TaskTrial } from '@/lib/halo-store'
import { analyzeMissionTrend, TREND_STATES, type TrendState } from '@/lib/mission-trends'
import { rehabGames, recommendPracticeGames, type RecommendedPractice } from '@/lib/rehab-games'

const SIGNALS = ['◇', '△', '○', '✦']
const SIGNAL_RULES = ['◇', '△', '○']
const TRIAL_COUNT = 12
const ORBITAL_TRIAL_COUNT = 10
const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 380

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`}>{children}</section>
}

function createSignalSequence() {
  return Array.from({ length: TRIAL_COUNT }, (_, index) => {
    const target = SIGNAL_RULES[Math.floor(index / 4) % SIGNAL_RULES.length]
    const shouldMatch = index % 3 !== 1
    const alternatives = SIGNALS.filter(signal => signal !== target)
    return {
      stimulus: shouldMatch ? target : alternatives[(index + Math.floor(index / 4)) % alternatives.length],
      target,
    }
  })
}

function classifyTrial(expected: TaskTrial['expectedResponse'], actual: TaskTrial['actualResponse']): TaskOutcome {
  if (actual === null) return 'omission'
  return expected === actual ? 'hit' : 'error'
}

function drawTaskFrame(
  context: CanvasRenderingContext2D,
  game: GameKind,
  signal: { stimulus: string; target: string } | undefined,
  shipX: number,
  objects: { type: 'pod' | 'debris'; x: number; y: number }[],
  time: number,
) {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.fillStyle = '#071427'
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.strokeStyle = 'rgba(86, 157, 213, .24)'
  context.lineWidth = 1
  for (let x = 30; x < CANVAS_WIDTH; x += 60) {
    context.beginPath()
    context.moveTo(x, 35)
    context.lineTo(x, CANVAS_HEIGHT - 30)
    context.stroke()
  }
  for (let y = 40; y < CANVAS_HEIGHT; y += 50) {
    context.beginPath()
    context.moveTo(20, y)
    context.lineTo(CANVAS_WIDTH - 20, y)
    context.stroke()
  }
  if (game === 'signal-match' && signal) {
    context.strokeStyle = 'rgba(75, 190, 255, .75)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(65, CANVAS_HEIGHT / 2)
    context.lineTo(CANVAS_WIDTH - 65, CANVAS_HEIGHT / 2)
    context.stroke()
    context.fillStyle = '#6bd6ff'
    context.shadowColor = '#2aaaff'
    context.shadowBlur = 20
    context.font = 'bold 94px system-ui'
    context.textAlign = 'center'
    const laneWidth = CANVAS_WIDTH - 160
    context.fillText(signal.stimulus, 80 + ((time * 0.13) % laneWidth), CANVAS_HEIGHT / 2 + 34)
    context.shadowBlur = 0
    context.fillStyle = '#d4e8ff'
    context.font = '14px system-ui'
    context.fillText(`ACTIVE RULE: MATCH ${signal.target}`, CANVAS_WIDTH / 2, 46)
  }
  if (game === 'orbital-supply-catch') {
    context.fillStyle = 'rgba(75, 174, 255, .17)'
    context.fillRect(0, CANVAS_HEIGHT - 55, CANVAS_WIDTH, 3)
    for (const object of objects) {
      context.fillStyle = object.type === 'pod' ? '#6de4c2' : '#ff9878'
      context.shadowColor = context.fillStyle
      context.shadowBlur = 12
      context.font = '30px system-ui'
      context.textAlign = 'center'
      context.fillText(object.type === 'pod' ? '▣' : '✦', object.x, object.y)
    }
    context.shadowBlur = 0
    context.fillStyle = '#8ed6ff'
    context.font = '42px system-ui'
    context.textAlign = 'center'
    context.fillText('◢', shipX, CANVAS_HEIGHT - 20)
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function summarize(session: TaskSession) {
  const times = session.trials.flatMap(trial => trial.outcome === 'hit' && trial.reactionTimeMs !== null ? [trial.reactionTimeMs] : [])
  const hits = session.trials.filter(trial => trial.outcome === 'hit').length
  return {
    accuracy: session.trials.length ? Math.round((hits / session.trials.length) * 100) : null,
    meanRt: times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null,
    medianRt: median(times),
    omissions: session.trials.filter(trial => trial.outcome === 'omission').length,
    falseAlarms: session.trials.filter(trial => trial.expectedResponse === 'no-match' && trial.actualResponse === 'match').length,
    validCatches: session.trials.filter(trial => trial.stimulus === 'ISS supply pod' && trial.outcome === 'hit').length,
    debrisHits: session.trials.filter(trial => trial.stimulus === 'Micrometeoroid debris' && trial.outcome === 'error').length,
    missedPods: session.trials.filter(trial => trial.stimulus === 'ISS supply pod' && trial.outcome === 'omission').length,
    durationMs: session.durationMs,
  }
}

export function TaskLab({ sessions, onComplete }: { sessions: TaskSession[]; onComplete: (session: TaskSession) => boolean }) {
  const [game, setGame] = useState<GameKind | null>(null)
  const [rehabilitationOpen, setRehabilitationOpen] = useState(false)
  const [sequence, setSequence] = useState<ReturnType<typeof createSignalSequence>>([])
  const [trialIndex, setTrialIndex] = useState(0)
  const [savedTrials, setSavedTrials] = useState<TaskTrial[]>([])
  const [shipX, setShipX] = useState(CANVAS_WIDTH / 2)
  const [feedback, setFeedback] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef(0)
  const trialStartedAtRef = useRef(0)
  const sessionIdRef = useRef('')
  const respondedRef = useRef(false)
  const trialsRef = useRef<TaskTrial[]>([])
  const gameRef = useRef<GameKind | null>(null)
  const orbitalRef = useRef({
    objects: [] as { id: string; type: 'pod' | 'debris'; x: number; y: number; spawnedAt: number; resolved: boolean }[],
    spawned: 0,
    nextSpawnAt: 0,
    lastFrame: 0,
    trials: [] as TaskTrial[],
    raf: 0,
    finish: false,
  })
  const shipRef = useRef(CANVAS_WIDTH / 2)
  const signal = sequence[trialIndex]
  const orderedSessions = useMemo(() => [...sessions].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)), [sessions])

  const finishSession = useCallback((kind: GameKind, trials: TaskTrial[]) => {
    const completedAt = new Date().toISOString()
    const session: TaskSession = {
      id: sessionIdRef.current,
      game: kind,
      source: 'participant-entered',
      startedAt: new Date(startRef.current).toISOString(),
      completedAt,
      durationMs: Date.now() - startRef.current,
      trials,
    }
    gameRef.current = null
    setGame(null)
    setFeedback(onComplete(session) ? 'Session saved. Complete the linked NASA-TLX assessment.' : 'Session could not be saved. Check the storage error and retry the task.')
  }, [onComplete])

  const finishSignalTrial = useCallback((actual: TaskTrial['actualResponse']) => {
    if (gameRef.current !== 'signal-match' || respondedRef.current) return
    respondedRef.current = true
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const active = sequence[trialIndex]
    if (!active) return
    const expectedResponse = active.stimulus === active.target ? 'match' : 'no-match'
    const trial: TaskTrial = {
      sessionId: sessionIdRef.current,
      trialId: `${sessionIdRef.current}-trial-${trialIndex + 1}`,
      source: 'participant-entered',
      stimulus: `${active.stimulus} · target ${active.target}`,
      expectedResponse,
      actualResponse: actual,
      reactionTimeMs: actual === null ? null : Math.max(0, Math.round(performance.now() - trialStartedAtRef.current)),
      outcome: classifyTrial(expectedResponse, actual),
    }
    const next = [...trialsRef.current, trial]
    trialsRef.current = next
    setSavedTrials(next)
    if (trialIndex + 1 >= sequence.length) {
      finishSession('signal-match', next)
      return
    }
    setTrialIndex(index => index + 1)
  }, [finishSession, sequence, trialIndex])

  const startGame = useCallback((kind: GameKind) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const now = Date.now()
    const id = `${kind}-${now}`
    startRef.current = now
    sessionIdRef.current = id
    gameRef.current = kind
    trialsRef.current = []
    setSavedTrials([])
    setFeedback('')
    setGame(kind)
    if (kind === 'signal-match') {
      setSequence(createSignalSequence())
      setTrialIndex(0)
      respondedRef.current = false
    } else {
      setShipX(CANVAS_WIDTH / 2)
      shipRef.current = CANVAS_WIDTH / 2
      orbitalRef.current = {
        objects: [],
        spawned: 0,
        nextSpawnAt: performance.now() + 800,
        lastFrame: 0,
        trials: [],
        raf: 0,
        finish: false,
      }
    }
  }, [])

  useEffect(() => {
    if (game !== 'signal-match') return
    respondedRef.current = false
    const active = sequence[trialIndex]
    if (!active) return
    trialStartedAtRef.current = performance.now()
    timeoutRef.current = setTimeout(() => finishSignalTrial(null), 1700)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [finishSignalTrial, game, sequence, trialIndex])

  useEffect(() => {
    if (game !== 'signal-match') return
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        finishSignalTrial('match')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [finishSignalTrial, game])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !game) return
    let active = true
    let frame = 0
    const draw = (time: number) => {
      if (!active) return
      drawTaskFrame(context, game, signal, shipX, orbitalRef.current.objects, time)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      active = false
      cancelAnimationFrame(frame)
    }
  }, [game, signal, shipX, trialIndex])

  useEffect(() => {
    if (game !== 'orbital-supply-catch') return
    let active = true
    const state = orbitalRef.current
    const tick = (now: number) => {
      if (!active || gameRef.current !== 'orbital-supply-catch') return
      const elapsed = state.lastFrame ? Math.min(50, now - state.lastFrame) : 0
      state.lastFrame = now
      if (state.spawned < ORBITAL_TRIAL_COUNT && now >= state.nextSpawnAt) {
        const index = state.spawned
        state.objects.push({
          id: `${sessionIdRef.current}-trial-${index + 1}`,
          type: index % 3 === 2 ? 'debris' : 'pod',
          x: 55 + Math.random() * (CANVAS_WIDTH - 110),
          y: 35,
          spawnedAt: now,
          resolved: false,
        })
        state.spawned += 1
        state.nextSpawnAt = now + 1050
      }
      const velocity = 0.19
      state.objects = state.objects.map(object => ({ ...object, y: object.y + velocity * elapsed }))
      const outcomeTrials: TaskTrial[] = []
      for (const object of state.objects) {
        if (object.resolved || object.y < CANVAS_HEIGHT - 66) continue
        const caught = Math.abs(object.x - shipRef.current) < 52
        const expectedResponse = object.type === 'pod' ? 'catch' : 'avoid'
        const actualResponse = caught ? 'catch' : object.type === 'pod' ? null : 'avoid'
        const outcome = object.type === 'pod'
          ? caught ? 'hit' : 'omission'
          : caught ? 'error' : 'hit'
        outcomeTrials.push({
          sessionId: sessionIdRef.current,
          trialId: object.id,
          source: 'participant-entered',
          stimulus: object.type === 'pod' ? 'ISS supply pod' : 'Micrometeoroid debris',
          expectedResponse,
          actualResponse,
          reactionTimeMs: actualResponse === null ? null : Math.max(0, Math.round(now - object.spawnedAt)),
          outcome,
        })
        object.resolved = true
      }
      if (outcomeTrials.length) {
        state.trials.push(...outcomeTrials)
        trialsRef.current = [...state.trials]
        setSavedTrials([...state.trials])
      }
      state.objects = state.objects.filter(object => !object.resolved)
      if (state.spawned === ORBITAL_TRIAL_COUNT && state.objects.length === 0) {
        active = false
        finishSession('orbital-supply-catch', [...state.trials])
        return
      }
      orbitalRef.current.raf = requestAnimationFrame(tick)
    }
    orbitalRef.current.raf = requestAnimationFrame(tick)
    return () => {
      active = false
      cancelAnimationFrame(orbitalRef.current.raf)
    }
  }, [finishSession, game])

  function moveShip(event: PointerEvent<HTMLCanvasElement>) {
    if (game !== 'orbital-supply-catch') return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(35, Math.min(CANVAS_WIDTH - 35, ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH))
    shipRef.current = x
    setShipX(x)
  }

  useEffect(() => {
    if (game !== 'orbital-supply-catch') return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const x = Math.max(35, Math.min(CANVAS_WIDTH - 35, shipRef.current + (event.key === 'ArrowLeft' ? -35 : 35)))
      shipRef.current = x
      setShipX(x)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [game])

  const currentTrialCount = game === 'orbital-supply-catch' ? orbitalRef.current.spawned : trialIndex + 1

  return <section className="workflow-page">
    <div className="workflow-heading"><div><h2>Cognitive tasks</h2><p>Playable canvas tasks. Every stimulus produces one trial record; omissions and errors are retained.</p></div></div>
    {rehabilitationOpen ? <Card className="rehabilitation-frame-card">
      <div className="rehabilitation-frame-heading">
        <div><h3>HALO Rehabilitation Protocol</h3><p>Game-based practice signals are experimental and are not a diagnosis or clinical assessment.</p></div>
        <div className="rehabilitation-frame-actions">
          <a className="quiet-button" href="/rehabilitation" target="_blank" rel="noopener noreferrer"><ExternalLink/> Open full page</a>
          <button className="secondary-button" onClick={() => setRehabilitationOpen(false)}>Back to tasks</button>
        </div>
      </div>
      <iframe className="rehabilitation-frame" src="/rehabilitation" title="HALO cognitive rehabilitation protocol"/>
    </Card> : !game ? <div className="task-choice-grid">
      <Card className="workflow-card"><Gamepad2/><h3>Signal Match</h3><p>Attend to the changing target rule and match only the active glyph. Use Space or Match; a missed response is logged as an omission.</p><button className="primary-button" onClick={() => startGame('signal-match')}>Start Signal Match</button></Card>
      <Card className="workflow-card"><MousePointer2/><h3>Orbital Supply Catch</h3><p>Catch supply pods and avoid debris. Move with the arrow keys or pointer/touch. Each spawn is one logged trial.</p><button className="primary-button" onClick={() => startGame('orbital-supply-catch')}>Start Orbital Catch</button></Card>
      <Card className="workflow-card rehabilitation-task-card"><Gamepad2/><h3>HALO Rehabilitation</h3><p>Open the Earth-themed multi-domain practice protocol and its focused follow-up games.</p><div className="rehabilitation-task-actions"><button className="primary-button" onClick={() => setRehabilitationOpen(true)}>Open rehabilitation</button><a className="quiet-button" href="/rehabilitation" target="_blank" rel="noopener noreferrer"><ExternalLink/> Open full page</a></div></Card>
    </div> : <Card className="canvas-task-card">
      <div className="canvas-task-heading"><div><h3>{game === 'signal-match' ? 'Signal Match · Sustained attention' : 'Orbital Supply Catch · Visuomotor coordination'}</h3><p>{game === 'signal-match' ? `Trial ${trialIndex + 1} of ${TRIAL_COUNT} · Rule shifts every four trials` : `Spawned ${currentTrialCount} of ${ORBITAL_TRIAL_COUNT} · ←/→ or pointer to steer`}</p></div><b className="pill neutral-pill">In progress</b></div>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="halo-task-canvas" onPointerDown={moveShip} onPointerMove={event => event.buttons === 1 && moveShip(event)} aria-label="Interactive two-dimensional cognitive task"/>
      {game === 'signal-match' && <div className="signal-task-actions"><button className="secondary-button" onClick={() => finishSignalTrial('no-match')}>No Match</button><button className="primary-button" onClick={() => finishSignalTrial('match')}>Match · Space</button></div>}
      <small className="task-control-note">{game === 'signal-match' ? 'Respond only when the incoming glyph matches the active target rule.' : 'Drag or tap the playfield to position the catcher; avoid the debris glyph.'}</small>
    </Card>}
    {feedback && <p className="task-feedback" role="status">{feedback}</p>}
    {orderedSessions.length > 0 && <Card className="saved-assessments-card"><h3>Saved task sessions</h3>{orderedSessions.map(session => {
      const summary = summarize(session)
      return <div className="saved-assessment-row" key={session.id}><div><b>{session.game === 'signal-match' ? 'Signal Match' : 'Orbital Supply Catch'} · {summary.accuracy ?? '—'}% accuracy</b><span>{new Date(session.completedAt).toLocaleString()} · {session.trials.length} trials · {summary.omissions} omissions · {summary.falseAlarms} false alarms · {summary.validCatches} valid catches · {summary.debrisHits} debris hits · {summary.missedPods} missed pods · {session.source.replaceAll('-', ' ')}</span></div><span>{summary.meanRt === null ? 'No valid RT' : `${summary.meanRt} ms mean RT`} · median {summary.medianRt === null ? '—' : `${summary.medianRt} ms`}</span></div>
    })}</Card>}
  </section>
}

function readPortalActivity(value: unknown): YukiGameAnalysis | undefined {
  if (!isRecord(value) || typeof value.game !== 'string' || !value.game.trim() || value.game.length > 80
    || typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt))) return undefined
  const rawId = typeof value.sessionId === 'string' ? value.sessionId : ''
  const id = rawId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100) || `rehab-${Date.parse(value.completedAt)}`
  if (value.schema === 'halo-rehabilitation-result.v1'
    && typeof value.exerciseId === 'number'
    && Number.isInteger(value.exerciseId) && value.exerciseId >= 1 && value.exerciseId <= 25
    && typeof value.score === 'number' && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100) {
    return {
      id,
      game: value.game.trim(),
      gameId: `rehabilitation-${value.exerciseId}`,
      recordedAt: new Date(value.completedAt).toISOString(),
      metrics: { finalScore: Math.round(value.score), scoreOutOf10: Number((value.score / 10).toFixed(1)) },
    }
  }
  if (value.schema !== 'halo-integrated-rehabilitation-result.v1'
    || typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > 100
    || typeof value.gameScore !== 'number' || !Number.isFinite(value.gameScore) || value.gameScore < 0 || value.gameScore > 100
    || typeof value.dilemmaScore !== 'number' || !Number.isFinite(value.dilemmaScore) || value.dilemmaScore < 0 || value.dilemmaScore > 100
    || typeof value.dilemmaCount !== 'number' || !Number.isInteger(value.dilemmaCount) || value.dilemmaCount < 1 || value.dilemmaCount > 10) return undefined
  return {
    id,
    game: value.game.trim(),
    gameId: 'integrated-rehabilitation',
    recordedAt: new Date(value.completedAt).toISOString(),
    metrics: {
      finalScore: Math.round(value.score),
      scoreOutOf10: Number((value.score / 10).toFixed(1)),
      gameScore: Math.round(value.gameScore),
      dilemmaScore: Math.round(value.dilemmaScore),
      dilemmaCount: value.dilemmaCount,
    },
  }
}

export function RehabilitationPractice({
  records,
  activities,
  onSaveActivity,
  onAnalyzeActivity,
  onActivityComplete,
  recommendedExerciseId,
}: {
  records: CheckIn[]
  activities: GameActivity[]
  onSaveActivity: (activity: YukiGameAnalysis) => GameActivity | null
  onAnalyzeActivity: (id: string) => void
  onActivityComplete: (activity: GameActivity) => void
  recommendedExerciseId: number | null
}) {
  const latest = [...records]
    .filter(record => record.source === 'synthetic-demo')
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0]
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [activityNotice, setActivityNotice] = useState('')
  const [protocolMode, setProtocolMode] = useState<'playlist' | 'integrated'>('playlist')
  const signals = [
    { label: 'Precision', value: latest?.rehabilitationPrecisionPercent, unit: '%' },
    { label: 'Reaction time', value: latest?.rehabilitationReactionMs, unit: 'ms' },
    { label: 'Attention', value: latest?.rehabilitationAttentionPercent, unit: '%' },
  ]

  useEffect(() => {
    function receiveActivity(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow || !isRecord(event.data)) return
      if (event.data.type !== 'halo-rehab-complete' && event.data.type !== 'halo-rehab-analyze') return
      const activity = readPortalActivity(event.data.result)
      if (!activity) {
        setActivityNotice('The rehabilitation result could not be validated and was not saved.')
        return
      }
      const saved = onSaveActivity(activity)
      if (!saved) {
        setActivityNotice('The rehabilitation result could not be saved to this session.')
        return
      }
      if (event.data.type === 'halo-rehab-analyze') {
        onAnalyzeActivity(saved.id)
        return
      }
      setActivityNotice(`Saved ${saved.game} to mission day ${saved.missionDay ?? 'unmapped'}. The result stays in this session.`)
      onActivityComplete(saved)
    }
    window.addEventListener('message', receiveActivity)
    return () => window.removeEventListener('message', receiveActivity)
  }, [onSaveActivity, onAnalyzeActivity, onActivityComplete])

  return <section className="workflow-page rehabilitation-workspace">
    <div className="workflow-heading"><div><h2></h2><p></p></div></div>
    <div className="rehabilitation-signal-grid">{signals.map(signal => <Card className="rehabilitation-signal-card" key={signal.label}><span>{signal.label} · latest NYMPHA record</span><strong>{signal.value ?? '—'}<small>{signal.value === undefined ? '' : signal.unit}</small></strong></Card>)}</div>
    <div className="rehabilitation-game-links" aria-label="Rehabilitation games">
      <a className="secondary-button" href="/games/quick_reaction_test.html" target="_blank" rel="noopener noreferrer"><Gamepad2/> Quick Reaction Test <ExternalLink/></a>
      <a className="secondary-button" href="/games/orbital_supply_catch.html" target="_blank" rel="noopener noreferrer"><Gamepad2/> Orbital Supply Catch <ExternalLink/></a>
      <a className="secondary-button" href="/games/dual_task_docking.html" target="_blank" rel="noopener noreferrer"><Gamepad2/> Dual-Task Docking <ExternalLink/></a>
    </div>
    <div className="rehabilitation-mode-switch" aria-label="Rehabilitation protocol">
      <button className={protocolMode === 'playlist' ? 'selected' : ''} aria-pressed={protocolMode === 'playlist'} onClick={() => setProtocolMode('playlist')}>25-game playlist</button>
      <button className={protocolMode === 'integrated' ? 'selected' : ''} aria-pressed={protocolMode === 'integrated'} onClick={() => setProtocolMode('integrated')}>Integrated game + dilemma test</button>
    </div>
    <Card className="rehabilitation-frame-card">
      <div className="rehabilitation-frame-heading">
        <div><h3>{protocolMode === 'integrated' ? 'Integrated practice + mission dilemmas' : 'HALO 25-game rehabilitation portal'}</h3><p>{protocolMode === 'integrated' ? 'Complete the game and randomized dilemma questions, then save the combined result.' : 'Practice feedback is separate from generated NYMPHA records; neither is a diagnosis or clinical assessment.'}</p></div>
      </div>
      <iframe key={`${protocolMode}-${recommendedExerciseId ?? ''}`} ref={iframeRef} className="rehabilitation-frame" src={protocolMode === 'integrated' ? '/integrated-rehabilitation' : recommendedExerciseId ? `/rehabilitation?exercise=${recommendedExerciseId}` : '/rehabilitation'} title={protocolMode === 'integrated' ? 'HALO integrated game and dilemma rehabilitation protocol' : 'HALO 25-game cognitive rehabilitation portal'}/>
    </Card>
    {activityNotice && <p className="task-feedback" role="status">{activityNotice}</p>}
    {activities.length > 0 && <Card className="saved-assessments-card"><h3>Saved practice results · this session</h3>{[...activities].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)).slice(0, 10).map(activity => <div className="saved-assessment-row" key={activity.id}><div><b>{activity.game} · {typeof activity.metrics.scoreOutOf10 === 'number' ? `${activity.metrics.scoreOutOf10}/10` : '—/10'}</b><span>Mission day {activity.missionDay ?? 'unmapped'} · {new Date(activity.recordedAt).toLocaleString()}</span></div><button className="quiet-button" onClick={() => onAnalyzeActivity(activity.id)}>Analyze with Yuki</button></div>)}</Card>}
  </section>
}

const trendColors: Record<TrendState, string> = {
  Baseline: '#4fe0b0',
  Rising: '#ffcb68',
  Higher: '#ff7f9b',
}

export function MLPatternInspector({ checkIns }: { checkIns: CheckIn[] }) {
  const analysis = analyzeMissionTrend(checkIns)
  const totalStates = analysis.points.length
  let stateOffset = 0
  const pieSegments = analysis.stateCounts.map(item => {
    const start = totalStates ? stateOffset / totalStates * 100 : 0
    stateOffset += item.count
    const end = totalStates ? stateOffset / totalStates * 100 : 0
    return `${trendColors[item.state]} ${start}% ${end}%`
  })
  const chartPoints = analysis.points.map((point, index) => ({
    ...point,
    x: analysis.points.length < 2 ? 280 : 35 + index * (490 / (analysis.points.length - 1)),
    y: 205 - point.wellnessIndex * 1.7,
  }))
  const pointLine = chartPoints.map(point => `${point.x},${point.y}`).join(' ')
  const latestDate = analysis.points[analysis.points.length - 1]?.date
  const firstDate = analysis.points[0]?.date
  const currentLabel = analysis.currentState ?? 'No NYMPHA data'
  const forecast = analysis.forecast

  return <section className="workflow-page ml-pattern-page">
    <div className="workflow-heading"><div><h2></h2><p></p></div></div>
    <Card className="workflow-card plain-language-card markov-explanation-card">
      <h3>How Markov chains are used in HALO</h3>
      <p>A Markov chain estimates what state may follow the current state by summarizing observed state-to-state transitions. In this prototype, it is applied only to generated NYMPHA demo records:</p>
      <ol className="markov-explanation-steps">
        <li><b>Summarize each day</b><span>Available sleep, stress, workload, heart-rate, blood-pressure, and rehabilitation values are normalized into a composite index and grouped as Baseline, Rising, or Higher.</span></li>
        <li><b>Count observed transitions</b><span>For consecutive days in the latest 15 generated records, HALO counts how often each state is followed by another state.</span></li>
        <li><b>Estimate the next state</b><span>The transition table uses add-one smoothing to display probabilities from the current state; the largest estimate is shown as the most common next state.</span></li>
      </ol>
      <p className="markov-explanation-note">These are illustrative summaries of synthetic data—not validated forecasts, causal findings, safety alerts, or medical assessments.</p>
    </Card>
    <div className="trend-summary-grid">
      <Card className="trend-summary-card"><span>Latest NYMPHA tier</span><strong style={{ color: analysis.currentState ? trendColors[analysis.currentState] : undefined }}>{currentLabel}</strong></Card>
      <Card className="trend-summary-card"><span>Latest NYMPHA index</span><strong>{analysis.wellnessIndex === null ? '—' : `${analysis.wellnessIndex.toFixed(1)} / 100`}</strong></Card>
      <Card className="trend-summary-card"><span>Score change over 15 days</span><strong className={analysis.change !== null && analysis.change < 0 ? 'trend-worsening' : 'trend-improving'}>{analysis.change === null ? '—' : `${analysis.change > 0 ? '+' : ''}${analysis.change}`}</strong></Card>
      <Card className="trend-summary-card"><span>Most common next NYMPHA tier</span><strong style={{ color: forecast ? trendColors[forecast.state] : undefined }}>{forecast ? `${forecast.state} · ${(forecast.probability * 100).toFixed(0)}%` : 'Not estimated'}</strong></Card>
    </div>
    <div className="trend-visual-grid">
      <Card className="workflow-card trend-line-card">
        <div className="trend-card-heading"><div><h3>NYMPHA index by day</h3></div><span>0–100</span></div>
        {chartPoints.length ? <><svg className="trend-line-chart" viewBox="0 0 560 250" role="img" aria-label="Declining generated NYMPHA index over 15 days">
          <g className="chart-grid"><path d="M35 35H525M35 120H525M35 205H525"/><path d="M35 35V205M280 35V205M525 35V205"/></g>
          {chartPoints.length > 1 && <polyline className="trend-line" points={pointLine}/>}
          {chartPoints.map(point => <circle key={point.date} cx={point.x} cy={point.y} r="5" fill={trendColors[point.state]}><title>{`${new Date(point.date).toLocaleDateString()}: NYMPHA index ${point.wellnessIndex.toFixed(1)}, ${point.state} tier`}</title></circle>)}
          <text x="0" y="39">100</text><text x="8" y="124">50</text><text x="17" y="209">0</text>
        </svg><div className="trend-date-labels"><span>{firstDate ? new Date(firstDate).toLocaleDateString() : '—'}</span><span>{latestDate ? new Date(latestDate).toLocaleDateString() : '—'}</span></div></> : <p className="empty-workflow-state">No NYMPHA records are available.</p>}
      </Card>
      <Card className="workflow-card trend-distribution-card">
        <div className="trend-card-heading"><div><h3>How the 15 days split</h3><p>Number of NYMPHA records in each tier.</p></div></div>
        {totalStates ? <div className="trend-donut-layout"><div className="trend-donut" style={{ backgroundImage: `conic-gradient(${pieSegments.join(', ')})` }} role="img" aria-label="Donut chart showing the distribution of three illustrative trend tiers"><div><strong>{totalStates}</strong><span>days</span></div></div><ul className="trend-legend">{analysis.stateCounts.map(item => <li key={item.state}><i style={{ background: trendColors[item.state] }}/><span>{item.state}</span><strong>{item.count}</strong></li>)}</ul></div> : <p className="empty-workflow-state">No state distribution to show.</p>}
      </Card>
      <Card className="workflow-card trend-metric-card">
        <div className="trend-card-heading"><div><h3>Latest metric signals</h3><p>Normalized NYMPHA index for each input; not a clinical score.</p></div></div>
        <div className="trend-metric-bars">{analysis.metrics.map(metric => <div className="trend-metric-row" key={metric.label}><div><span>{metric.label}</span><strong>{metric.value}{metric.unit}</strong></div><div className="trend-bar-track" role="progressbar" aria-label={`${metric.label} normalized NYMPHA index`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={metric.adverseIndex}><i style={{ width: `${metric.adverseIndex}%` }}/></div><small>{metric.change === null ? '—' : `${metric.change > 0 ? '+' : ''}${metric.change} index points vs. prior day`}</small></div>)}</div>
      </Card>
      <Card className="workflow-card transition-matrix-card">
        <div className="trend-card-heading"><div><h3>What tier followed each one?</h3><p>Counts how the NYMPHA tier changed from one day to the next.</p></div></div>
        <div className="transition-matrix-scroll"><table className="transition-matrix"><thead><tr><th>From / to</th>{TREND_STATES.map(state => <th key={state}>{state}</th>)}</tr></thead><tbody>{TREND_STATES.map(from => {
          const row = analysis.counts[from]
          const observed = TREND_STATES.reduce((sum, state) => sum + row[state], 0)
          return <tr key={from}><th>{from}</th>{TREND_STATES.map(to => {
            const count = row[to]
            const probability = (count + 1) / (observed + TREND_STATES.length)
            return <td key={to} style={{ backgroundColor: `${trendColors[to]}${Math.round(probability * 95).toString(16).padStart(2, '0')}` }}><strong>{(probability * 100).toFixed(0)}%</strong><small>{count} observed</small></td>
          })}</tr>
        })}</tbody></table></div>
        <p className="transition-forecast">For this dataset, after <strong>{currentLabel}</strong>: {analysis.nextStateEstimate.map(item => `${item.state} ${(item.probability * 100).toFixed(0)}%`).join(' · ') || 'not available'}</p>
      </Card>
    </div>
    <Card className="workflow-card model-card"><h3><FlaskConical/> Model notes</h3><dl><div><dt>Inputs</dt><dd>Latest 15 generated NYMPHA records: sleep, stress, workload, heart rate, blood pressure, and three rehabilitation indicators.</dd></div><div><dt>Method</dt><dd>Fixed normalization rules, a composite trend index, three illustrative tiers, and a first-order Markov transition table with add-one smoothing.</dd></div></dl></Card>
  </section>
}

type OsdrResult = Omit<ResearchReference, 'id'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function ResearchExplorer({ references, onPin }: { references: ResearchReference[]; onPin: (reference: OsdrResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OsdrResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retrievedAt, setRetrievedAt] = useState('')
  const [cached, setCached] = useState(false)

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!query.trim() || loading) return
    setLoading(true)
    setHasSearched(true)
    setResults([])
    setError('')
    setRetrievedAt('')
    setCached(false)
    try {
      const response = await fetch(`/api/osdr?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
      const body: unknown = await response.json()
      if (!response.ok || !isRecord(body) || !Array.isArray(body.results)) {
        throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'NASA OSDR search is unavailable.')
      }
      const newResults = body.results as OsdrResult[]
      const newRetrievedAt = typeof body.retrievedAt === 'string' ? body.retrievedAt : new Date().toISOString()
      localStorage.setItem(`halo.osdrCache.v1.${query.trim().toLowerCase()}`, JSON.stringify({ results: newResults, retrievedAt: newRetrievedAt }))
      setResults(newResults)
      setRetrievedAt(newRetrievedAt)
      setCached(Boolean('cached' in body && body.cached === true))
    } catch (reason) {
      const cachedValue = localStorage.getItem(`halo.osdrCache.v1.${query.trim().toLowerCase()}`)
      if (cachedValue) {
        try {
          const parsed: unknown = JSON.parse(cachedValue)
          if (isRecord(parsed) && Array.isArray(parsed.results) && typeof parsed.retrievedAt === 'string') {
            setResults(parsed.results as OsdrResult[])
            setRetrievedAt(parsed.retrievedAt)
            setCached(true)
            setError('NASA OSDR is offline; showing the last cached results.')
          } else throw new Error('The saved OSDR cache is invalid.')
        } catch (cacheError) {
          setResults([])
          setError(cacheError instanceof Error ? cacheError.message : 'The saved OSDR cache is invalid.')
        }
      } else {
        setError(reason instanceof Error ? reason.message : 'NASA OSDR search is unavailable.')
        setResults([])
      }
    } finally {
      setLoading(false)
    }
  }

  return <section className="workflow-page research-library-page">
    <div className="workflow-heading"><div><h2></h2><p></p></div></div>
    <Card className="workflow-card"><form className="research-search-form" onSubmit={search}><label>Study title or accession<input value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. OSD-..." required/></label><button className="primary-button" disabled={loading}>{loading ? 'Searching…' : 'Search NASA OSDR'}</button></form>
      {!results.length && <div className={`research-empty-visual ${hasSearched ? 'is-faint' : ''}`}><img src="/nasaosdrlogo.ico" alt="NASA OSDR logo"/></div>}
      {retrievedAt && <small className="retrieval-timestamp">{cached ? 'Cached result · originally retrieved ' : 'Retrieved '}{new Date(retrievedAt).toLocaleString()} · External NASA OSDR</small>}
      {error && <p className="form-error" role="alert">{error} If offline, retry when connected; pinned references remain in local storage.</p>}
      {results.length ? <div className="osdr-results">{results.map(result => <article key={result.accession} className="osdr-result"><div><span className="source-label external-source">External NASA OSDR</span><h3>{result.title}</h3><p><b>{result.accession}</b> · {result.context || 'Organism/context not provided'}</p>{result.description && <p className="osdr-description">{result.description}</p>}<small>Assays: {result.assays.length ? result.assays.join(', ') : 'Not specified'}</small><small>Retrieved {new Date(result.retrievedAt).toLocaleString()}</small></div><div><a href={result.sourceUrl} target="_blank" rel="noreferrer" className="secondary-button"><ExternalLink/> Source</a><button className="primary-button" onClick={() => onPin(result)}>Pin Reference to Mission Log</button></div></article>)}</div> : !error && !loading && <p className="empty-workflow-state">{hasSearched ? 'No matching NASA OSDR records found. Try a different study title or accession.' : 'Search by study title or accession to explore public NASA research.'}</p>}
    </Card>
    {references.length > 0 && <Card className="saved-assessments-card"><h3>Pinned OSDR references</h3>{references.map(reference => <div key={reference.id} className="saved-assessment-row"><div><b>{reference.accession} · {reference.title}</b><span>{reference.context} · Retrieved {new Date(reference.retrievedAt).toLocaleString()}</span></div><a href={reference.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${reference.accession}`}><ExternalLink/></a></div>)}</Card>}
  </section>
}

const belongingScenes = [
  { src: '/belonging/kyoto-city.webp', alt: 'Kyoto city and pagoda in the mountains' },
  { src: '/belonging/todai-ji.webp', alt: 'Historic Japanese temple and grounds' },
  { src: '/belonging/fuji-sakura.webp', alt: 'Mount Fuji and cherry blossoms at sunset' },
  { src: '/belonging/kyoto-temple-night.webp', alt: 'Illuminated Japanese temple at night' },
  { src: '/belonging/tokyo-night.webp', alt: 'Tokyo skyline at night' },
]

type BelongingStage = 'idle' | 'loading' | 'playing'

export function BelongingExperience() {
  const [stage, setStage] = useState<BelongingStage>('idle')
  const [countdown, setCountdown] = useState(10)
  const [slideIndex, setSlideIndex] = useState(0)
  const [videoReady, setVideoReady] = useState(false)

  function startTour() {
    setCountdown(10)
    setSlideIndex(0)
    setVideoReady(false)
    setStage('loading')
  }

  function closeTour() {
    setStage('idle')
  }

  useEffect(() => {
    if (stage !== 'loading') return
    const countdownTimer = window.setInterval(() => setCountdown(seconds => Math.max(0, seconds - 1)), 1_000)
    const slideshowTimer = window.setInterval(() => setSlideIndex(index => (index + 1) % belongingScenes.length), 2_400)
    const launchTimer = window.setTimeout(() => setStage('playing'), 10_000)
    return () => {
      window.clearInterval(countdownTimer)
      window.clearInterval(slideshowTimer)
      window.clearTimeout(launchTimer)
    }
  }, [stage])

  useEffect(() => {
    if (stage === 'idle') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [stage])

  return <>
    <section className="belonging-page">
      <div className="belonging-copy">
        <div className="belonging-kicker"><HeartHandshake aria-hidden="true"/> EXPERIMENTAL FEATURE</div>
        <h2>Belonging</h2>
        <p className="belonging-description">Take an optional daily visit to familiar places and sounds from Japan. The scenic film begins after a full-screen photo slideshow.</p>
        <p className="belonging-boundary">A comfort experience, not treatment for loneliness or depression. Reach out to your crew or support team if you need more support.</p>
        <div className="belonging-details"><span>About 1 hour</span><span>10-second photo slideshow</span><span>Video includes calming music</span></div>
        <button className="primary-button belonging-start" type="button" onClick={startTour}><Play aria-hidden="true"/> Start Japan hometown tour</button>
      </div>
    </section>
    {stage !== 'idle' && typeof document !== 'undefined' && createPortal(
      <div className="belonging-stage" role="dialog" aria-modal="true" aria-label="Japan hometown relaxation film">
        {stage === 'playing' && <iframe
          className="belonging-video is-visible"
          src="https://player.vimeo.com/video/1246968373?autopause=0&amp;player_id=0&amp;app_id=58479&amp;autoplay=1"
          title="Japan 4K - Scenic Relaxation Film With Calming Music"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setVideoReady(true)}
          allowFullScreen
        />}
        {stage === 'loading' && <>
          <img key={belongingScenes[slideIndex].src} className="belonging-slide" src={belongingScenes[slideIndex].src} alt={belongingScenes[slideIndex].alt}/>
          <div className="belonging-stage-shade"/>
          <div className="belonging-loading-copy" role="status" aria-live="polite">
            <span>YOUR DAILY VISIT HOME</span>
            <h2>Take a breath. Settle in.</h2>
            <p>Preparing the Japan scenic film · {countdown} seconds</p>
            <div className="belonging-loading-track"><i style={{ width: `${(10 - countdown) * 10}%` }}/></div>
          </div>
        </>}
        {stage === 'playing' && !videoReady && <p className="belonging-buffering" role="status">Loading the Vimeo film…</p>}
        {stage === 'playing' && <a className="belonging-vimeo-fallback" href="https://vimeo.com/1246968373" target="_blank" rel="noopener noreferrer">Open film on Vimeo</a>}
        <button className="quiet-button belonging-close" type="button" onClick={closeTour}>Close tour</button>
      </div>,
      document.body,
    )}
  </>
}

type YukiIntent = 'overview' | 'research' | 'games' | 'mission-analysis' | 'chat'
type YukiStudy = { accession: string; title: string; context: string; description: string; assays: string[]; sourceUrl: string }
type YukiGame = { name: string; description: string; url: string; license: string; stars: number }
export type YukiGameAnalysis = Pick<GameActivity, 'id' | 'game' | 'gameId' | 'recordedAt' | 'metrics'>
type YukiMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  provider?: 'groq' | 'offline'
  studies?: YukiStudy[]
  games?: YukiGame[]
  warning?: string
  localOnly?: boolean
  rehabilitationLink?: boolean
  analysisBoundary?: boolean
  analysisFacts?: string[]
  recommendedPractices?: RecommendedPractice[]
  gameAnalysis?: YukiGameAnalysis
}

function buildRecentMissionContext(data: HaloData) {
  const allDates = [...new Set([
    ...data.checkIns.map(item => localDateKey(new Date(item.recordedAt))),
    ...data.taskSessions.map(item => localDateKey(new Date(item.completedAt))),
    ...data.gameActivities.map(item => item.missionDate),
  ])].sort()
  const recentDates = new Set(allDates.slice(-15))
  const dayNumbers = new Map(allDates.map((date, index) => [date, index + 1]))
  const metricKeys = [
    'sleepHours',
    'stress',
    'currentWorkload',
    'restingHeartRate',
    'bloodPressureSystolic',
    'bloodPressureDiastolic',
    'rehabilitationPrecisionPercent',
    'rehabilitationReactionMs',
    'rehabilitationAttentionPercent',
  ] as const
  const checkIns = data.checkIns.flatMap(record => {
    const date = localDateKey(new Date(record.recordedAt))
    if (!recentDates.has(date) || record.source === 'external-nasa-osdr') return []
    const metrics: Record<string, number | null> = Object.fromEntries(metricKeys.map(key => [key, record[key]]))
    const tlxKeys = ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration'] as const
    for (const key of tlxKeys) metrics[`tlx${key[0].toUpperCase()}${key.slice(1)}`] = record.dailyTlxRatings?.[key] ?? null
    return [{
      date,
      missionDay: dayNumbers.get(date) ?? null,
      source: record.source,
      metrics,
      notMeasuredFields: record.notMeasuredFields ?? [],
    }]
  })
  const tlxKeys = ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration'] as const
  const taskSessions = data.taskSessions.flatMap(session => {
    const date = localDateKey(new Date(session.completedAt))
    if (!recentDates.has(date) || session.source === 'external-nasa-osdr') return []
    const hitTimes = session.trials.flatMap(trial => trial.outcome === 'hit' && typeof trial.reactionTimeMs === 'number' ? [trial.reactionTimeMs] : [])
    const assessment = data.tlxAssessments.find(item => item.sessionId === session.id)
    const tlxSource = assessment && isMissionRecordSource(assessment.source) ? assessment.source : null
    const tlxRatings: Record<string, number | null> = Object.fromEntries(tlxKeys.map(key => [key, assessment?.ratings[key] ?? null]))
    return [{
      id: session.id,
      game: session.game,
      date,
      missionDay: dayNumbers.get(date) ?? null,
      source: session.source,
      durationMs: session.durationMs,
      trialCount: session.trials.length,
      hits: session.trials.filter(trial => trial.outcome === 'hit').length,
      errors: session.trials.filter(trial => trial.outcome === 'error').length,
      omissions: session.trials.filter(trial => trial.outcome === 'omission').length,
      meanReactionMs: hitTimes.length ? Math.round(hitTimes.reduce((sum, time) => sum + time, 0) / hitTimes.length) : null,
      tlxSource,
      tlxRatings,
    }]
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(-400)
  const gameActivities = data.gameActivities
    .filter(activity => recentDates.has(activity.missionDate))
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
    .slice(-400)
    .map(activity => ({
      id: activity.id,
      gameId: activity.gameId,
      date: activity.missionDate,
      missionDay: dayNumbers.get(activity.missionDate) ?? activity.missionDay,
      source: activity.source,
      game: activity.game,
      metrics: activity.metrics,
    }))
  return { checkIns, taskSessions, gameActivities }
}

function isMissionRecordSource(value: unknown): value is 'synthetic-demo' | 'participant-entered' {
  return value === 'synthetic-demo' || value === 'participant-entered'
}

function isTaskGameKind(value: unknown): value is GameKind {
  return value === 'signal-match' || value === 'orbital-supply-catch'
}

function isDateKey(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
}

function readDebriefMissionContext(value: unknown) {
  if (!isRecord(value) || !isRecord(value.records)
    || !Array.isArray(value.records.checkIns) || !Array.isArray(value.records.gameActivities)) return null

  const checkIns = value.records.checkIns.flatMap(item => {
    if (!isRecord(item)) return []
    const source = item.source
    if (typeof item.recordedAt !== 'string' || !Number.isFinite(Date.parse(item.recordedAt))
      || !isMissionRecordSource(source)) return []
    const date = localDateKey(new Date(item.recordedAt))
    const metrics: Record<string, number | null> = {}
    for (const key of [
      'sleepHours', 'stress', 'currentWorkload', 'restingHeartRate',
      'bloodPressureSystolic', 'bloodPressureDiastolic',
      'rehabilitationPrecisionPercent', 'rehabilitationReactionMs', 'rehabilitationAttentionPercent',
    ]) {
      const metric = item[key]
      metrics[key] = typeof metric === 'number' && Number.isFinite(metric) ? metric : null
    }
    const ratings = isRecord(item.dailyTlxRatings) ? item.dailyTlxRatings : null
    for (const key of ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration']) {
      const rating = ratings?.[key]
      metrics[`tlx${key[0].toUpperCase()}${key.slice(1)}`] = typeof rating === 'number' && Number.isFinite(rating) ? rating : null
    }
    const missionDay = typeof item.missionDay === 'number' && Number.isInteger(item.missionDay) && item.missionDay >= 1 && item.missionDay <= 250
      ? item.missionDay
      : null
    const notMeasuredFields = Array.isArray(item.notMeasuredFields)
      ? item.notMeasuredFields.filter((field): field is string => typeof field === 'string' && [
        'sleepHours', 'stress', 'currentWorkload', 'restingHeartRate',
        'bloodPressureSystolic', 'bloodPressureDiastolic',
      ].includes(field))
      : []
    return [{ date, missionDay, source, metrics, notMeasuredFields }]
  })

  const gameActivities = value.records.gameActivities.flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length > 120
      || typeof item.gameId !== 'string' || item.gameId.length > 120
      || typeof item.game !== 'string' || !item.game.trim()
      || typeof item.recordedAt !== 'string' || !Number.isFinite(Date.parse(item.recordedAt))
      || !isMissionRecordSource(item.source)
      || !isRecord(item.metrics)) return []
    const date = typeof item.missionDate === 'string' && isDateKey(item.missionDate)
      ? item.missionDate
      : localDateKey(new Date(item.recordedAt))
    const metrics: Record<string, number | string> = {}
    for (const [key, metric] of Object.entries(item.metrics).slice(0, 12)) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)) continue
      if (typeof metric === 'number' && Number.isFinite(metric) && Math.abs(metric) <= 1_000_000
        || typeof metric === 'string' && metric.length <= 80) metrics[key] = metric
    }
    if (!Object.keys(metrics).length) return []
    const missionDay = typeof item.missionDay === 'number' && Number.isInteger(item.missionDay) && item.missionDay >= 1 && item.missionDay <= 250
      ? item.missionDay
      : null
    return [{
      id: item.id,
      gameId: item.gameId,
      date,
      missionDay,
      source: item.source,
      game: item.game.trim().slice(0, 80),
      metrics,
    }]
  })
  const tlxAssessments = Array.isArray(value.records.tlxAssessments) ? value.records.tlxAssessments : []
  const tlxBySession = new Map<string, { source: 'synthetic-demo' | 'participant-entered'; ratings: Record<string, number | null> }>()
  for (const assessment of tlxAssessments) {
    if (!isRecord(assessment) || typeof assessment.sessionId !== 'string' || !isRecord(assessment.ratings)
      || !isMissionRecordSource(assessment.source)) continue
    const ratings: Record<string, number | null> = {}
    for (const key of ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration']) {
      const rating = assessment.ratings[key]
      ratings[key] = typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && rating <= 100 ? rating : null
    }
    tlxBySession.set(assessment.sessionId, { source: assessment.source, ratings })
  }
  const taskSessions = (Array.isArray(value.records.taskSessions) ? value.records.taskSessions : []).flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length > 120
      || !isTaskGameKind(item.game)
      || typeof item.completedAt !== 'string' || !Number.isFinite(Date.parse(item.completedAt))
      || !isMissionRecordSource(item.source)
      || typeof item.durationMs !== 'number' || !Number.isFinite(item.durationMs) || item.durationMs < 0
      || !Array.isArray(item.trials)) return []
    const trials = item.trials.filter(isRecord)
    if (trials.length > 500) return []
    const hits = trials.filter(trial => trial.outcome === 'hit').length
    const errors = trials.filter(trial => trial.outcome === 'error').length
    const omissions = trials.filter(trial => trial.outcome === 'omission').length
    const reactionTimes = trials.flatMap(trial => trial.outcome === 'hit'
      && typeof trial.reactionTimeMs === 'number' && Number.isFinite(trial.reactionTimeMs) && trial.reactionTimeMs >= 0
      ? [trial.reactionTimeMs] : [])
    const date = localDateKey(new Date(item.completedAt))
    const game: GameKind = item.game
    return [{
      id: item.id,
      game,
      date,
      missionDay: typeof item.missionDay === 'number' && Number.isInteger(item.missionDay) && item.missionDay >= 1 && item.missionDay <= 250
        ? item.missionDay
        : null,
      source: item.source,
      durationMs: item.durationMs,
      trialCount: trials.length,
      hits,
      errors,
      omissions,
      meanReactionMs: reactionTimes.length ? Math.round(reactionTimes.reduce((sum, time) => sum + time, 0) / reactionTimes.length) : null,
      tlxSource: tlxBySession.get(item.id)?.source ?? null,
      tlxRatings: tlxBySession.get(item.id)?.ratings ?? Object.fromEntries(
        ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration'].map(key => [key, null]),
      ),
    }]
  })
  const recentDates = new Set([...new Set([
    ...checkIns.map(item => item.date),
    ...taskSessions.map(item => item.date),
    ...gameActivities.map(item => item.date),
  ])].sort().slice(-15))
  const recentCheckIns = checkIns
    .filter(item => recentDates.has(item.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source))
    .slice(-30)
  const recentGameActivities = gameActivities
    .filter(item => recentDates.has(item.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(-400)
  const recentTaskSessions = taskSessions
    .filter(item => recentDates.has(item.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(-400)
  return recentCheckIns.length || recentTaskSessions.length || recentGameActivities.length
    ? { checkIns: recentCheckIns, taskSessions: recentTaskSessions, gameActivities: recentGameActivities }
    : null
}

function classifyYukiIntent(text: string): YukiIntent {
  const normalized = text.toLowerCase()
  if (/analy[sz]e|review/.test(normalized) && /(last|past|recent|15.?day|check.?in|record|metric|log|data)/.test(normalized)
    || /過去.{0,6}日|最近.{0,8}(記録|データ)|記録を(分析|確認)|データを分析/.test(text)) return 'mission-analysis'
  if (/\bhow(?:'s| is) my (?:health|wellbeing|well-being|health metrics?|vitals?)\b/.test(normalized)
    || /\bhow am i (?:doing|feeling|holding up)\b/.test(normalized)
    || /\b(?:review|assess|check|analy[sz]e)\b.{0,40}\b(?:my health|my wellbeing|my well-being|my metrics|my vitals|how i(?:'m| am) doing)\b/.test(normalized)) return 'mission-analysis'
  if (/game|play|open.?source|github|repo/.test(normalized)) return 'games'
  if (/nasa|osdr|research|study|studies|spaceflight/.test(normalized)) return 'research'
  if (/summari[sz]e|my (local )?(log|records|measurements)|how many (check.?ins|sessions)|latest (sleep|stress|heart rate)/.test(normalized)) return 'overview'
  return 'chat'
}

function localOverview(data: HaloData) {
  const latestValue = (field: 'sleepHours' | 'stress' | 'restingHeartRate', unit: string) => {
    const record = [...data.checkIns].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)).find(item => item[field] !== null)
    if (!record) return 'Not measured'
    const value = record[field]
    return `${value}${unit} · ${record.source === 'synthetic-demo' ? 'NYMPHA record' : 'Participant-entered'}`
  }
  const pendingTlx = data.taskSessions.filter(session => !data.tlxAssessments.some(item => item.sessionId === session.id)).length
  const syntheticCount = data.checkIns.filter(item => item.source === 'synthetic-demo').length
  return `Your NYMPHA data view contains ${data.checkIns.length} daily records and ${data.taskSessions.length} task sessions; ${syntheticCount} records are generated for interface preview, not live telemetry. Pending NASA-TLX assessments: ${pendingTlx}. Latest recorded sleep: ${latestValue('sleepHours', ' h')}; stress: ${latestValue('stress', '/10')}; heart rate: ${latestValue('restingHeartRate', ' bpm')}. These summaries cannot tell us what is wrong or predict your health. The generated warning is not a personal assessment. If you'd like, the rehabilitation games are available for optional practice; they are not treatment or clinical tests.`
}

function readStudies(value: unknown): YukiStudy[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!isRecord(item)
      || typeof item.accession !== 'string'
      || typeof item.title !== 'string'
      || typeof item.context !== 'string'
      || typeof item.sourceUrl !== 'string'
      || !Array.isArray(item.assays)
      || !item.assays.every(assay => typeof assay === 'string')) return []
    return [{
      accession: item.accession,
      title: item.title,
      context: item.context,
      description: typeof item.description === 'string' ? item.description : '',
      assays: item.assays,
      sourceUrl: item.sourceUrl,
    }]
  })
}

function readGames(value: unknown): YukiGame[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => isRecord(item)
    && typeof item.name === 'string'
    && typeof item.description === 'string'
    && typeof item.url === 'string'
    && typeof item.license === 'string'
    && typeof item.stars === 'number'
    ? [{ name: item.name, description: item.description, url: item.url, license: item.license, stars: item.stars }]
    : [])
}

function readGameAnalysis(value: unknown): YukiGameAnalysis | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.game !== 'string'
    || typeof value.gameId !== 'string'
    || typeof value.recordedAt !== 'string'
    || !isRecord(value.metrics)) return undefined
  const metrics: Record<string, number | string> = {}
  for (const [key, metric] of Object.entries(value.metrics)) {
    if (/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)
      && (typeof metric === 'string' && metric.length <= 80 || typeof metric === 'number' && Number.isFinite(metric))) metrics[key] = metric
  }
  return Object.keys(metrics).length
    ? { id: value.id, game: value.game, gameId: value.gameId, recordedAt: value.recordedAt, metrics }
    : undefined
}

function readAnalysisFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(fact => typeof fact === 'string' && fact.length <= 2_000 ? [fact] : []).slice(0, 80)
}

function readPracticeRecommendations(value: unknown): RecommendedPractice[] | undefined {
  const items = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
  const recommendations = items.flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'number' || typeof item.reason !== 'string') return []
    const game = rehabGames.find(candidate => candidate.id === item.id)
    if (!game) return []
    return [{
      ...game,
      href: `/rehabilitation?exercise=${game.id}`,
      reason: item.reason.slice(0, 300),
      averageScore: typeof item.averageScore === 'number' && Number.isFinite(item.averageScore) ? item.averageScore : null,
      recordedRuns: typeof item.recordedRuns === 'number' && Number.isInteger(item.recordedRuns) && item.recordedRuns >= 0 ? item.recordedRuns : 0,
    }]
  })
  return recommendations.length ? recommendations : undefined
}

export function YukiAssistant({
  data,
  recordAnalysisAllowed,
  onSaveGameActivity,
  pendingGameActivityId,
  onPendingGameActivityHandled,
  active,
}: {
  data: HaloData
  recordAnalysisAllowed: boolean
  onSaveGameActivity: (activity: YukiGameAnalysis) => void
  pendingGameActivityId: string | null
  onPendingGameActivityHandled: () => void
  active: boolean
}) {
  const [messages, setMessages] = useState<YukiMessage[]>([{
    id: 'yuki-intro',
    role: 'assistant',
    text: 'Hi, I’m Yuki, your HALO mission companion. English is my default; ask me explicitly if you would like Japanese. I can listen, help you think through mission stress, review recent game practice, or suggest a small next step. I’m not a clinician, but I’ll respond with care and help you find human support when you need it.',
  }])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)
  const gameFileInputRef = useRef<HTMLInputElement>(null)
  const handledPendingIdRef = useRef<string | null>(null)
  const recordAnalysisLockMessage = 'Complete and save today’s rehabilitation game before asking Yuki to summarize or analyze mission records.'

  function showRecordAnalysisLock() {
    setMessages(current => [...current, {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: recordAnalysisLockMessage,
      provider: 'offline',
      localOnly: true,
    }])
  }

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > 2_000 || loading) return
    const intent = classifyYukiIntent(trimmed)
    setDraft('')
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed, localOnly: intent === 'mission-analysis' || intent === 'overview' }])
    if (!recordAnalysisAllowed && (intent === 'mission-analysis' || intent === 'overview')) {
      showRecordAnalysisLock()
      return
    }
    if (intent === 'overview') {
      setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', text: localOverview(data), provider: 'offline', localOnly: true, rehabilitationLink: true }])
      return
    }

    setLoading(true)
    try {
      const history = messages
        .filter(message => message.id !== 'yuki-intro' && !message.localOnly)
        .slice(-8)
        .map(({ role, text: content }) => ({ role, content }))
      const requestBody: Record<string, unknown> = { intent, message: trimmed, history }
      const missionContext = intent === 'mission-analysis'
        ? buildRecentMissionContext(data)
        : null
      if (intent === 'mission-analysis') {
        requestBody.missionContext = missionContext
        requestBody.recentDataConsent = true
      }
      const response = await fetch('/api/yuki-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const body: unknown = await response.json()
      if (!response.ok || !isRecord(body) || typeof body.reply !== 'string' || (body.provider !== 'groq' && body.provider !== 'offline')) {
        throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'Yuki could not complete that request.')
      }
      const reply = body.reply
      const provider = body.provider
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reply,
        provider,
        studies: readStudies(body.studies),
        games: readGames(body.games),
        warning: typeof body.warning === 'string' ? body.warning : undefined,
        localOnly: intent === 'mission-analysis',
        rehabilitationLink: intent === 'mission-analysis',
        analysisBoundary: intent === 'mission-analysis',
        analysisFacts: intent === 'mission-analysis' ? readAnalysisFacts(body.analysisFacts) : undefined,
        recommendedPractices: intent === 'mission-analysis'
          ? readPracticeRecommendations(body.recommendedGames ?? body.recommendedGame) ?? recommendPracticeGames(missionContext?.gameActivities ?? [])
          : undefined,
      }])
    } catch (reason) {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reason instanceof Error ? reason.message : 'Yuki could not complete that request.',
        provider: 'offline',
      }])
    } finally {
      setLoading(false)
    }
  }

  async function requestGameAnalysis(gameFile: unknown, question: string) {
    if (!recordAnalysisAllowed) {
      showRecordAnalysisLock()
      return
    }
    if (loading) return
    const missionContext = buildRecentMissionContext(data)
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text: question, localOnly: true }])
    setLoading(true)
    try {
      const history = messages
        .filter(message => message.id !== 'yuki-intro' && !message.localOnly)
        .slice(-8)
        .map(({ role, text: content }) => ({ role, content }))
      const response = await fetch('/api/yuki-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'game-analysis',
          message: 'Review the selected game summary with the supplied recent mission context and relevant NASA OSDR study metadata. Describe trends cautiously.',
          history,
          gameFile,
          missionContext,
          recentDataConsent: true,
        }),
      })
      const body: unknown = await response.json()
      if (!response.ok || !isRecord(body) || typeof body.reply !== 'string' || (body.provider !== 'groq' && body.provider !== 'offline')) {
        throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'Yuki could not analyze that game file.')
      }
      const reply = body.reply
      const provider = body.provider
      const studies = readStudies(body.studies)
      const warning = typeof body.warning === 'string' ? body.warning : undefined
      const gameAnalysis = readGameAnalysis(body.gameAnalysis)
      if (gameAnalysis) onSaveGameActivity(gameAnalysis)
      const recommendedPractices = readPracticeRecommendations(body.recommendedGames ?? body.recommendedGame)
        ?? recommendPracticeGames([...missionContext.gameActivities, ...(gameAnalysis ? [{
          gameId: gameAnalysis.gameId,
          metrics: gameAnalysis.metrics,
        }] : [])])
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reply,
        provider,
        studies,
        warning,
        gameAnalysis,
        rehabilitationLink: true,
        analysisBoundary: true,
        analysisFacts: readAnalysisFacts(body.analysisFacts),
        recommendedPractices,
        localOnly: true,
      }])
    } catch (reason) {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reason instanceof Error ? reason.message : 'Yuki could not analyze that game file.',
        provider: 'offline',
      }])
    } finally {
      setLoading(false)
    }
  }

  async function requestMissionAnalysis(missionContext: ReturnType<typeof buildRecentMissionContext>, question: string) {
    if (!recordAnalysisAllowed) {
      showRecordAnalysisLock()
      return
    }
    if (loading) return
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text: question, localOnly: true }])
    setLoading(true)
    try {
      const history = messages
        .filter(message => message.id !== 'yuki-intro' && !message.localOnly)
        .slice(-8)
        .map(({ role, text: content }) => ({ role, content }))
      const response = await fetch('/api/yuki-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'mission-analysis',
          message: question,
          history,
          missionContext,
          recentDataConsent: true,
        }),
      })
      const body: unknown = await response.json()
      if (!response.ok || !isRecord(body) || typeof body.reply !== 'string' || (body.provider !== 'groq' && body.provider !== 'offline')) {
        throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'Yuki could not analyze that mission debrief.')
      }
      const reply = body.reply
      const provider = body.provider
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reply,
        provider,
        warning: typeof body.warning === 'string' ? body.warning : undefined,
        studies: readStudies(body.studies),
        rehabilitationLink: true,
        analysisBoundary: true,
        analysisFacts: readAnalysisFacts(body.analysisFacts),
        recommendedPractices: readPracticeRecommendations(body.recommendedGames ?? body.recommendedGame)
          ?? recommendPracticeGames(missionContext.gameActivities),
        localOnly: true,
      }])
    } catch (reason) {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reason instanceof Error ? reason.message : 'Yuki could not analyze that mission debrief.',
        provider: 'offline',
      }])
    } finally {
      setLoading(false)
    }
  }

  async function analyzeGameFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || loading) return
    if (file.size > 1_000_000) {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'That JSON file is larger than 1 MB. Export a smaller HALO mission debrief or game summary and try again.',
        provider: 'offline',
      }])
      return
    }

    let gameFile: unknown
    try {
      gameFile = JSON.parse(await file.text())
    } catch {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'I could not read that file as JSON. Choose a completed HALO game export.',
        provider: 'offline',
      }])
      return
    }
    if (!isRecord(gameFile)) {
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'That JSON does not contain a supported HALO game summary.',
        provider: 'offline',
      }])
      return
    }
    if (isRecord(gameFile.records)) {
      const missionContext = readDebriefMissionContext(gameFile)
      if (!missionContext) {
        setMessages(current => [...current, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'I could not find dated check-in or game records in the latest 15 days of that debrief.',
          provider: 'offline',
        }])
        return
      }
      void requestMissionAnalysis(
        missionContext,
        'Review every available game JSON result in this uploaded HALO debrief’s latest 15 dates. Describe per-game score patterns and suggest multiple optional games from the playlist.',
      )
      return
    }
    void requestGameAnalysis(
      gameFile,
      'Analyze my selected game JSON with the latest 15 days of NYMPHA records and relevant NASA OSDR research.',
    )
  }

  useEffect(() => {
    if (!pendingGameActivityId || loading || handledPendingIdRef.current === pendingGameActivityId) return
    const activity = data.gameActivities.find(item => item.id === pendingGameActivityId)
    if (!activity) {
      onPendingGameActivityHandled()
      return
    }
    handledPendingIdRef.current = activity.id
    const exerciseId = /^rehabilitation-(\d+)$/.exec(activity.gameId)?.[1]
    const gameFile = exerciseId
      ? {
        schema: 'halo-rehabilitation-result.v1',
        id: activity.id,
        exerciseId: Number(exerciseId),
        game: activity.game,
        completedAt: activity.recordedAt,
        score: activity.metrics.finalScore,
      }
      : { id: activity.id, game: activity.game, completedAt: activity.recordedAt, ...activity.metrics }
    void requestGameAnalysis(
      gameFile,
      `Review this completed run from mission day ${activity.missionDay ?? 'unmapped'} with the latest 15 days of NYMPHA records and NASA OSDR research.`,
    ).finally(onPendingGameActivityHandled)
  }, [pendingGameActivityId, data.gameActivities, loading])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(draft)
  }

  return <section className="yuki-assistant yuki-chat-page glass-card" id="yuki-assistant" aria-label="Yuki AI assistant" hidden={!active}>
    <header className="yuki-chat-header"><div className="yuki-chat-avatar"><Bot/></div><div><h2>Yuki</h2><p>HALO mission companion</p></div><span className="yuki-presence"><i/> READY TO LISTEN</span></header>
    <details className="yuki-privacy-details"><summary>How Yuki uses mission data</summary><p>Chat and up to 8 recent messages may be sent to the configured AI service. Normal chat does not attach dashboard records. A 15-day review includes available daily metrics, TLX ratings, and game results; uploading a HALO debrief JSON reviews only its validated records from the latest 15 dates (up to 400 game runs). Notes, raw trials, and unrelated file content are never sent. Participant-entered readings are excluded unless you opt in below.</p></details>
    <div className="yuki-chat-intro"><span>HALO · MISSION COMPANION</span><p>Ask me about your mission, your recent records, or what you’d like to work through.</p></div>
    <div className="yuki-chat-history" ref={historyRef} role="log" aria-live="polite">
      {messages.map(message => <article key={message.id} className={`yuki-message ${message.role}`}>
        <div className="yuki-message-meta">{message.role === 'assistant' && <span className="yuki-message-avatar"><Bot/></span>}<b>{message.role === 'user' ? 'You' : 'Yuki'}</b></div>
        <p>{message.text}</p>
        {message.warning && <small className="yuki-warning">{message.warning}</small>}
        {message.role === 'assistant' && message.analysisBoundary && <small className="yuki-analysis-boundary">Generated NYMPHA records are not live telemetry; participant-entered values are self-reported. A game score is separate practice feedback, not a medical assessment.</small>}
        {message.analysisFacts && message.analysisFacts.length > 0 && <div className="yuki-analysis-facts"><b>Data summary · raw values, not clinical thresholds</b><ul>{message.analysisFacts.map((fact, index) => <li key={`${index}-${fact}`}>{fact}</li>)}</ul></div>}
        {message.recommendedPractices && <div className="yuki-practice-options"><b>Optional practice choices · based on game scores</b>{message.recommendedPractices.map(game => <a className="secondary-button yuki-recommended-practice" key={game.id} href={game.href}><Gamepad2/><span><strong>#{game.id} {game.title}</strong><small>{game.domain} · {game.reason}</small></span></a>)}</div>}
        {message.gameAnalysis && <div className="yuki-game-analysis"><b>{message.gameAnalysis.game} · imported run summary</b><ul>{Object.entries(message.gameAnalysis.metrics).map(([key, value]) => <li key={key}><span>{key.replace(/[A-Z]/g, letter => ` ${letter}`).replace(/^./, letter => letter.toUpperCase())}</span><strong>{value}</strong></li>)}</ul></div>}
        {message.rehabilitationLink && <a className="secondary-button yuki-rehabilitation-link" href="/rehabilitation">Open rehabilitation practice</a>}
        {message.studies && message.studies.length > 0 && <div className="yuki-source-list"><b>NASA OSDR sources</b>{message.studies.map(study => <a key={study.accession} href={study.sourceUrl} target="_blank" rel="noreferrer"><strong>{study.accession}: {study.title}</strong><span>{study.context || 'Study context not provided'}{study.assays.length ? ` · ${study.assays.join(', ')}` : ''}</span>{study.description && <span>{study.description}</span>}</a>)}</div>}
        {message.games && message.games.length > 0 && <div className="yuki-game-list"><b>Open-source game projects</b>{message.games.map(game => <a key={game.url} href={game.url} target="_blank" rel="noreferrer"><strong>{game.name}</strong><span>{game.description || 'No description provided.'}</span><small>{game.license} · {game.stars.toLocaleString()} GitHub stars</small></a>)}</div>}
      </article>)}
      {loading && <p className="yuki-loading" role="status">Yuki is thinking…</p>}
    </div>
    {!recordAnalysisAllowed && <p className="yuki-analysis-lock-note" role="status">{recordAnalysisLockMessage}</p>}
    <div className="yuki-quick-prompts">{[
      ['Summarize my log', 'overview'],
      ['Review the last 15 days', 'mission-analysis'],
      ['Explore NASA research', 'research'],
    ].map(([label, prompt]) => <button id={prompt === 'overview' ? 'yuki-summary-prompt' : prompt === 'mission-analysis' ? 'yuki-mission-analysis-prompt' : undefined} key={prompt} className="quiet-button" type="button" onClick={() => void sendMessage(label)} disabled={loading || !recordAnalysisAllowed && (prompt === 'overview' || prompt === 'mission-analysis')}>{label}</button>)}</div>
    <input ref={gameFileInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={event => void analyzeGameFile(event)} aria-hidden="true" tabIndex={-1} disabled={!recordAnalysisAllowed}/>
    <button className="quiet-button yuki-analyze-game" type="button" onClick={() => gameFileInputRef.current?.click()} disabled={loading || !recordAnalysisAllowed}><Gamepad2/> Analyze game JSON + recent 15 days</button>
    <form className="yuki-chat-form" onSubmit={submit}><label className="sr-only" htmlFor="yuki-chat-input">Message Yuki AI</label><input id="yuki-chat-input" maxLength={2_000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask Yuki anything about the mission…"/><button className="primary-button" type="submit" disabled={loading || !draft.trim()} aria-label="Send message"><Send/></button></form>
    <small className="yuki-disclaimer">No diagnosis or treatment advice. Practice recommendations are optional and based only on game practice scores. Verify mission procedures with approved sources.</small>
  </section>
}
