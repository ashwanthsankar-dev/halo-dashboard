import type { ResearchReference } from '@/lib/halo-store'

export type OsdrResult = Omit<ResearchReference, 'id'>
type OsdrSearchResponse = { results: OsdrResult[]; retrievedAt: string; cached: boolean }

const responseCache = new Map<string, OsdrResult[]>()

function searchUrl(query: string) {
  const params = new URLSearchParams({
    term: query,
    source: 'cgene,alsda,esa',
    type: 'study',
    from: '0',
    size: '20',
  })
  return `https://osdr.nasa.gov/geode-py/ws/repo/search?${params}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

function readStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item === 'string') return [item]
    if (!isRecord(item)) return []
    const result = readString(item, ['name', 'assay_name', 'assayType', 'type', 'label'])
    return result ? [result] : []
  })
}

function findStudyRecords(value: unknown, found: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value === null || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    for (const item of value) findStudyRecords(item, found, depth + 1)
    return found
  }
  const record = value as Record<string, unknown>
  const accession = readString(record, ['accession', 'accession_number', 'study_accession', 'studyAccession', 'Accession'])
  const title = readString(record, ['title', 'study_title', 'studyTitle', 'name', 'Study Title'])
  if (accession && title) found.push(record)
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') findStudyRecords(child, found, depth + 1)
  }
  return found
}

function normalizeResults(value: unknown, retrievedAt: string): OsdrResult[] {
  const unique = new Map<string, OsdrResult>()
  for (const record of findStudyRecords(value)) {
    const accession = readString(record, ['accession', 'accession_number', 'study_accession', 'studyAccession', 'Accession'])
    const title = readString(record, ['title', 'study_title', 'studyTitle', 'name', 'Study Title'])
    if (!accession || !title) continue
    const assays = [...new Set([
      ...readStrings(record.assays ?? record.assay_types ?? record.assayTypes ?? record.experiment_types),
      ...readStrings(record['Study Assay Technology Type']),
      ...readStrings(record['Study Assay Measurement Type']),
    ])]
    const mission = isRecord(record.Mission) ? readString(record.Mission, ['Name']) : ''
    const context = [
      readString(record, ['organism', 'Organism', 'organism_name', 'organismName', 'species']),
      readString(record, ['context', 'study_type', 'studyType', 'Study Factor Type']),
      readString(record, ['Material Type']),
      readString(record, ['Flight Program']),
      mission,
    ].filter(Boolean).join(' · ')
    unique.set(accession, {
      accession,
      title,
      context,
      description: readString(record, ['Study Description', 'study_description', 'studyDescription', 'description']).slice(0, 3_000),
      assays,
      sourceUrl: `https://osdr.nasa.gov/bio/repo/data/studies/${encodeURIComponent(accession)}`,
      retrievedAt,
      source: 'external-nasa-osdr',
    })
  }
  return [...unique.values()].slice(0, 20)
}

async function fetchStudies(query: string, timeoutMs: number) {
  const retrievedAt = new Date().toISOString()
  const response = await fetch(searchUrl(query), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`NASA OSDR returned HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('json')) throw new Error('NASA OSDR returned an unsupported response type.')
  return { results: normalizeResults(await response.json(), retrievedAt), retrievedAt }
}

export async function searchNASAOsdr(query: string): Promise<OsdrSearchResponse> {
  const cacheKey = query.toLowerCase()
  try {
    const result = await fetchStudies(query, 8_000)
    responseCache.set(cacheKey, result.results)
    return { ...result, cached: false }
  } catch (error) {
    const cachedResults = responseCache.get(cacheKey)
    if (cachedResults) return { results: cachedResults, retrievedAt: new Date().toISOString(), cached: true }
    throw error
  }
}

export async function searchNASAOsdrQuick(query: string): Promise<OsdrSearchResponse> {
  const cacheKey = query.toLowerCase()
  const cachedResults = responseCache.get(cacheKey)
  if (cachedResults) return { results: cachedResults, retrievedAt: new Date().toISOString(), cached: true }
  const result = await fetchStudies(query, 4_000)
  responseCache.set(cacheKey, result.results)
  return { ...result, cached: false }
}
