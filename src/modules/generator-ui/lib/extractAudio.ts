import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg } from './transcodeToMp4'

// Base64 expands bytes by roughly one third. Leave headroom below the 25 MB
// gateway request limit for JSON and request metadata.
export const MAX_TRANSCRIPT_AUDIO_BYTES = 18 * 1024 * 1024

function inputExtension(blob: Blob): string {
  if (blob.type.includes('webm')) return 'webm'
  if (blob.type.includes('ogg')) return 'ogg'
  if (blob.type.includes('quicktime')) return 'mov'
  return 'mp4'
}

export async function extractAudioAsBase64(blob: Blob): Promise<string> {
  const ff = await getFFmpeg()
  const inputName = `in_${Date.now()}.${inputExtension(blob)}`
  const outputName = `out_${Date.now()}.mp3`

  try {
    await ff.writeFile(inputName, await fetchFile(blob))
    await ff.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-b:a', '64k', '-ar', '16000', outputName])

    const outData = await ff.readFile(outputName)
    if (!(outData instanceof Uint8Array)) {
      throw new Error('Audio extraction returned an invalid output.')
    }
    if (outData.byteLength > MAX_TRANSCRIPT_AUDIO_BYTES) {
      throw new Error('The extracted audio is too long to transcribe in one request.')
    }

    let binary = ''
    for (let i = 0; i < outData.byteLength; i++) {
      binary += String.fromCharCode(outData[i])
    }
    return btoa(binary)
  } finally {
    await Promise.allSettled([
      ff.deleteFile(inputName),
      ff.deleteFile(outputName),
    ])
  }
}
