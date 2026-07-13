import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg } from './transcodeToMp4'

export async function extractAudioAsBase64(blob: Blob): Promise<string> {
  const ff = await getFFmpeg()
  const inputName = `in_${Date.now()}.mp4`
  const outputName = `out_${Date.now()}.mp3`

  await ff.writeFile(inputName, await fetchFile(blob))
  
  // Extract audio as 64k mp3 (small enough for transcription)
  await ff.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-ab', '64k', '-ar', '16000', outputName])

  const outData = await ff.readFile(outputName)
  
  // Clean up
  ff.deleteFile(inputName).catch(() => {})
  ff.deleteFile(outputName).catch(() => {})

  const uint8 = outData as Uint8Array
  // Convert Uint8Array to base64
  let binary = ''
  for (let i = 0; i < uint8.byteLength; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  return btoa(binary)
}
