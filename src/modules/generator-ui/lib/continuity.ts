// Continuity Mode — per-chain scene memory + prompt block helpers.
//
// Smallest-safe approach: continuity state is persisted in localStorage keyed
// by the active draft/generation-chain id (the same id used to group a
// project's clips). No DB schema or provider changes are required — the
// continuation frame is already carried on the job via first_frame_url, and the
// continuity text is embedded in the saved prompt, so jobs stay debuggable and
// repeatable.

export type ContinuationSource = 'previous-final-frame' | 'best-clear-frame'

export interface SceneMemory {
  character: string
  environment: string
  style: string
  lastState: string
}

export interface ContinuityState {
  enabled: boolean
  source: ContinuationSource
  memory: SceneMemory
}

export const EMPTY_MEMORY: SceneMemory = {
  character: '',
  environment: '',
  style: '',
  lastState: '',
}

export const DEFAULT_CONTINUITY: ContinuityState = {
  enabled: false,
  source: 'previous-final-frame',
  memory: { ...EMPTY_MEMORY },
}

const KEY_PREFIX = 'generator:continuity:'

function keyFor(chainId: string | null | undefined): string | null {
  if (!chainId) return null
  return `${KEY_PREFIX}${chainId}`
}

export function loadContinuity(chainId: string | null | undefined): ContinuityState {
  const key = keyFor(chainId)
  if (!key || typeof window === 'undefined') return { ...DEFAULT_CONTINUITY, memory: { ...EMPTY_MEMORY } }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return { ...DEFAULT_CONTINUITY, memory: { ...EMPTY_MEMORY } }
    const parsed = JSON.parse(raw) as Partial<ContinuityState>
    return {
      enabled: Boolean(parsed.enabled),
      source: parsed.source === 'best-clear-frame' ? 'best-clear-frame' : 'previous-final-frame',
      memory: {
        character: parsed.memory?.character ?? '',
        environment: parsed.memory?.environment ?? '',
        style: parsed.memory?.style ?? '',
        lastState: parsed.memory?.lastState ?? '',
      },
    }
  } catch {
    return { ...DEFAULT_CONTINUITY, memory: { ...EMPTY_MEMORY } }
  }
}

export function saveContinuity(chainId: string | null | undefined, state: ContinuityState): void {
  const key = keyFor(chainId)
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function isMemoryEmpty(memory: SceneMemory): boolean {
  return !memory.character.trim() && !memory.environment.trim() && !memory.style.trim() && !memory.lastState.trim()
}

// Lightweight, local starter-memory generator. Derives a first-pass scene
// memory from the user's current prompt and optional character description.
// No AI call — the user can refine it via "Edit memory".
export function generateStarterMemory(prompt: string, characterDescription?: string): SceneMemory {
  const clean = (prompt || '').replace(/\s+/g, ' ').trim()
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] || clean
  return {
    character: (characterDescription || '').trim() || (clean ? `Main subject from: ${firstSentence}` : ''),
    environment: clean ? `Setting described in: ${firstSentence}` : '',
    style: clean ? 'Match the visual style, lighting, and color palette of the previous clip.' : '',
    lastState: clean ? `Ending state of the previous clip: ${firstSentence}` : '',
  }
}

const CONTINUITY_INSTRUCTION =
  'Continue directly from the previous clip. Preserve the same main character, outfit, proportions, colors, visual style, lighting, environment, camera language, and story context. Use the provided previous frame as the motion and position bridge. Use the character/reference image to preserve identity and fine details. Do not redesign the character, location, or visual style unless the user explicitly asks for a change.'

// Builds the continuity block (instruction + scene memory) to append to a prompt.
export function buildContinuityBlock(memory: SceneMemory): string {
  const lines = ['Scene memory:']
  if (memory.character.trim()) lines.push(`Main character: ${memory.character.trim()}`)
  if (memory.environment.trim()) lines.push(`Environment: ${memory.environment.trim()}`)
  if (memory.style.trim()) lines.push(`Visual style: ${memory.style.trim()}`)
  if (memory.lastState.trim()) lines.push(`Previous ending state: ${memory.lastState.trim()}`)
  const memoryBlock = lines.length > 1 ? `\n\n${lines.join('\n')}` : ''
  return `${CONTINUITY_INSTRUCTION}${memoryBlock}`
}

// Appends the continuity block to a prompt.
export function applyContinuityPrompt(prompt: string, memory: SceneMemory): string {
  return `${prompt}\n\n${buildContinuityBlock(memory)}`
}
