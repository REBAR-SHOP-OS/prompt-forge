// Catalog of named character voices (Gemini prebuilt voices) used by the
// Voiceover dialog. Each entry maps to a Gemini voiceName, a gender group,
// a short personality hint, and a pre-made sample clip (CDN asset) so users
// can preview voices instantly with no AI cost.

import childAutonoe from '@/assets/voice-samples/child-Autonoe.mp3.asset.json'
import childKore from '@/assets/voice-samples/child-Kore.mp3.asset.json'
import childLeda from '@/assets/voice-samples/child-Leda.mp3.asset.json'
import femaleAoede from '@/assets/voice-samples/female-Aoede.mp3.asset.json'
import femaleAutonoe from '@/assets/voice-samples/female-Autonoe.mp3.asset.json'
import femaleCallirrhoe from '@/assets/voice-samples/female-Callirrhoe.mp3.asset.json'
import femaleDespina from '@/assets/voice-samples/female-Despina.mp3.asset.json'
import femaleKore from '@/assets/voice-samples/female-Kore.mp3.asset.json'
import femaleLeda from '@/assets/voice-samples/female-Leda.mp3.asset.json'
import maleAchird from '@/assets/voice-samples/male-Achird.mp3.asset.json'
import maleAlgieba from '@/assets/voice-samples/male-Algieba.mp3.asset.json'
import maleCharon from '@/assets/voice-samples/male-Charon.mp3.asset.json'
import maleFenrir from '@/assets/voice-samples/male-Fenrir.mp3.asset.json'
import maleOrus from '@/assets/voice-samples/male-Orus.mp3.asset.json'
import malePuck from '@/assets/voice-samples/male-Puck.mp3.asset.json'

export type VoiceGender = 'female' | 'male' | 'child'

export interface VoiceOption {
  /** Stable id used for selection state and sample lookup. */
  id: string
  /** Gemini prebuilt voiceName sent to the TTS function. */
  voiceName: string
  gender: VoiceGender
  /** Display name shown to the user. */
  label: string
  /** Short personality hint. */
  personality: string
  /** Pre-made sample clip URL (instant preview, no AI cost). */
  sampleUrl: string
}

export const VOICE_CATALOG: VoiceOption[] = [
  // Female
  { id: 'female-Leda', voiceName: 'Leda', gender: 'female', label: 'Leda', personality: 'Youthful', sampleUrl: femaleLeda.url },
  { id: 'female-Kore', voiceName: 'Kore', gender: 'female', label: 'Kore', personality: 'Firm & energetic', sampleUrl: femaleKore.url },
  { id: 'female-Aoede', voiceName: 'Aoede', gender: 'female', label: 'Aoede', personality: 'Breezy & calm', sampleUrl: femaleAoede.url },
  { id: 'female-Callirrhoe', voiceName: 'Callirrhoe', gender: 'female', label: 'Callirrhoe', personality: 'Easy-going', sampleUrl: femaleCallirrhoe.url },
  { id: 'female-Autonoe', voiceName: 'Autonoe', gender: 'female', label: 'Autonoe', personality: 'Bright', sampleUrl: femaleAutonoe.url },
  { id: 'female-Despina', voiceName: 'Despina', gender: 'female', label: 'Despina', personality: 'Smooth', sampleUrl: femaleDespina.url },
  // Male
  { id: 'male-Puck', voiceName: 'Puck', gender: 'male', label: 'Puck', personality: 'Upbeat', sampleUrl: malePuck.url },
  { id: 'male-Charon', voiceName: 'Charon', gender: 'male', label: 'Charon', personality: 'Informative', sampleUrl: maleCharon.url },
  { id: 'male-Fenrir', voiceName: 'Fenrir', gender: 'male', label: 'Fenrir', personality: 'Excitable', sampleUrl: maleFenrir.url },
  { id: 'male-Algieba', voiceName: 'Algieba', gender: 'male', label: 'Algieba', personality: 'Smooth', sampleUrl: maleAlgieba.url },
  { id: 'male-Orus', voiceName: 'Orus', gender: 'male', label: 'Orus', personality: 'Firm', sampleUrl: maleOrus.url },
  { id: 'male-Achird', voiceName: 'Achird', gender: 'male', label: 'Achird', personality: 'Friendly', sampleUrl: maleAchird.url },
  // Child
  { id: 'child-Leda', voiceName: 'Leda', gender: 'child', label: 'Leda', personality: 'Bright & youthful', sampleUrl: childLeda.url },
  { id: 'child-Kore', voiceName: 'Kore', gender: 'child', label: 'Kore', personality: 'Playful & energetic', sampleUrl: childKore.url },
  { id: 'child-Autonoe', voiceName: 'Autonoe', gender: 'child', label: 'Autonoe', personality: 'Sweet & light', sampleUrl: childAutonoe.url },
]

export function voicesForGender(gender: VoiceGender): VoiceOption[] {
  return VOICE_CATALOG.filter((v) => v.gender === gender)
}

export function defaultVoiceForGender(gender: VoiceGender): VoiceOption {
  return voicesForGender(gender)[0]
}

export function getVoiceById(id: string): VoiceOption | undefined {
  return VOICE_CATALOG.find((v) => v.id === id)
}
