import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

export const runtime = 'nodejs'

const videoPath = resolve(process.cwd(), '..', '..', 'Japan 4K - Scenic Relaxation Film With Calming Music.mp4')

function createVideoStream(start?: number, end?: number) {
  const fileStream = createReadStream(videoPath, start === undefined ? {} : { start, end })
  const iterator = fileStream[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel() {
      fileStream.destroy()
    },
  })
}

export async function GET(request: Request) {
  let file
  try {
    file = await stat(videoPath)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return new Response('The local Japan relaxation film was not found.', { status: 404 })
    }
    throw error
  }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Type': 'video/mp4',
  })
  const range = request.headers.get('range')

  if (!range) {
    headers.set('Content-Length', String(file.size))
    return new Response(createVideoStream(), { headers })
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } })

  let start = match[1] ? Number(match[1]) : 0
  let end = match[2] ? Number(match[2]) : file.size - 1
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2])
    start = Math.max(file.size - suffixLength, 0)
    end = file.size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= file.size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } })
  }

  end = Math.min(end, file.size - 1)
  headers.set('Content-Length', String(end - start + 1))
  headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`)
  return new Response(createVideoStream(start, end), { status: 206, headers })
}
