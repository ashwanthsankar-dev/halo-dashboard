import { NextResponse } from 'next/server'
import { searchNASAOsdr } from '@/lib/osdr'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!query || query.length > 120) {
    return NextResponse.json({ error: 'Enter a search term of 1–120 characters.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await searchNASAOsdr(query))
  } catch (error) {
    console.error('NASA OSDR search failed and no server cache was available.', error)
    return NextResponse.json({ error: 'NASA OSDR is unavailable and no cached results exist for this query.' }, { status: 503 })
  }
}
