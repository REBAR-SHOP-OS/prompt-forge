// Anti-duplicate detection for film scenarios — two-stage design.
//
// Stage 1 (fast, deterministic): a comparable fingerprint of the scenario's
//   creative structure — opening, ending, concept words, action verbs, and
//   camera progression. This is a cheap pre-filter that rejects obvious
//   duplicates and accepts obvious non-duplicates without any model call.
//
// Stage 2 (semantic judge): for the ambiguous band (fingerprint similarity in
//   [fastThreshold, hardThreshold)), an LLM judge — using the project's
//   existing Lovable AI Gateway, no new provider — decides whether two
//   scenarios describe the SAME film concept even when the wording differs.
//
// Product/character identity is METADATA ONLY. A changed product/character does
// NOT make a duplicate story "different": the story structure is compared
// identity-independently, so a re-told story with a new identity is still a
// duplicate. (The identity is retained in the fingerprint for audit, but it is
// never used to short-circuit similarity.)
//
// This module is pure and shared by the scenario-write edge function (Deno) and
// the vitest suite, so the backend and tests agree on what "duplicate" means.

export interface ScenarioFingerprint {
  /** Normalized opening hook (first plan/shot). */
  opening: string
  /** Normalized ending/payoff (last plan/shot). */
  ending: string
  /** Sorted, deduped content-word signature of the whole scenario. */
  concept: string[]
  /** Sorted, deduped camera-move token signature. */
  camera: string[]
  /** Product/character identity key — metadata only, never used for similarity. */
  subjectCombo: string
}

/** A persisted history entry: the fingerprint plus the full text for the judge. */
export interface ScenarioHistoryEntry {
  fingerprint: ScenarioFingerprint
  scenarioText: string
}

/** Function words dropped from the concept signature so they don't inflate similarity. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by',
  'for', 'from', 'in', 'into', 'of', 'on', 'onto', 'to', 'with', 'without',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'can', 'could',
  'may', 'might', 'must', 'it', 'its', 'this', 'that', 'these', 'those',
  'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my', 'your', 'his', 'her',
  'their', 'our', 'them', 'us', 'who', 'whom', 'which', 'what', 'when',
  'where', 'why', 'how', 'not', 'no', 'nor', 'too', 'very', 'just', 'also',
  'each', 'every', 'all', 'any', 'some', 'such', 'than', 'then', 'there',
  'here', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
  'once', 'now', 'about', 'above', 'below', 'between', 'through', 'during',
  'before', 'after', 'while', 'because', 'until', 'against', 'among',
  'scene', 'shot', 'plan', 'film', 'video', 'second', 'seconds', 's',
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'with', 'for', 'is',
  'this', 'that', 'it', 'as', 'at', 'by', 'from', 'into', 'over', 'under',
  'across', 'around', 'through', 'toward', 'towards', 'along', 'within',
  'without', 'between', 'behind', 'beyond', 'beside', 'near', 'next',
  'each', 'every', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'first', 'second', 'third', 'final', 'last',
  'then', 'now', 'here', 'there', 'where', 'when', 'while', 'during',
  'before', 'after', 'until', 'since', 'once', 'again', 'still', 'yet',
  'already', 'just', 'only', 'also', 'too', 'very', 'more', 'most', 'less',
  'least', 'much', 'many', 'some', 'any', 'all', 'both', 'few', 'several',
  'such', 'other', 'another', 'same', 'different', 'own', 'self', 'its',
  'his', 'her', 'their', 'our', 'your', 'my', 'me', 'we', 'you', 'they',
  'he', 'she', 'it', 'them', 'us', 'who', 'whom', 'whose', 'which', 'what',
  'be', 'been', 'being', 'am', 'is', 'are', 'was', 'were', 'do', 'does',
  'did', 'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'can',
  'could', 'may', 'might', 'must', 'ought', 'need', 'dare', 'not', 'no',
  'nor', 'neither', 'either', 'or', 'but', 'if', 'though', 'although',
  'because', 'so', 'than', 'as', 'like', 'unlike', 'per', 'via', 'vs',
  'versus', 'etc', 'eg', 'ie', 'etcetera', 'namely', 'specifically',
])

/** Camera-move / framing vocabulary used to detect camera progression. */
const CAMERA_TOKENS = [
  'pan', 'tilt', 'zoom', 'dolly', 'track', 'tracking', 'crane', 'orbit',
  'arc', 'push', 'pull', 'wide', 'medium', 'close', 'closeup', 'close-up',
  'establishing', 'aerial', 'drone', 'handheld', 'steady', 'slow', 'fast',
  'sweep', 'glide', 'rise', 'lower', 'follow', 'reveal', 'cut', 'fade',
  'dissolve', 'whip', 'snap', 'macro', 'detail', 'overhead', 'top-down',
  'low-angle', 'high-angle', 'eye-level', 'pov', 'first-person', 'spin',
  'rotate', '360', 'cinematic', 'slow-motion', 'time-lapse', 'timelapse',
]

/** Action-verb vocabulary used to detect the main action of a film. */
const ACTION_VERBS = [
  'show', 'reveal', 'demonstrate', 'display', 'present', 'hold', 'use',
  'apply', 'pour', 'cut', 'build', 'assemble', 'install', 'place', 'lift',
  'move', 'turn', 'open', 'close', 'walk', 'run', 'smile', 'talk', 'speak',
  'point', 'gesture', 'interact', 'transform', 'change', 'glide', 'float',
  'spin', 'rotate', 'zoom', 'pan', 'tilt', 'sweep', 'rise', 'fall', 'appear',
  'disappear', 'highlight', 'emphasize', 'compare', 'contrast', 'showcase',
  'feature', 'introduce', 'launch', 'unveil', 'celebrate', 'connect',
  'protect', 'deliver', 'perform', 'operate', 'drive', 'carry', 'wear',
  'spray', 'polish', 'clean', 'test', 'measure', 'inspect', 'weld', 'drill',
  'fasten', 'secure', 'mount', 'construct', 'manufacture', 'produce',
  'create', 'craft', 'design', 'engineer', 'pour', 'mix', 'stir', 'bake',
  'cook', 'serve', 'pour', 'fill', 'empty', 'load', 'unload', 'stack',
  'arrange', 'organize', 'sort', 'pack', 'wrap', 'unbox', 'open', 'close',
  'switch', 'press', 'push', 'pull', 'slide', 'snap', 'click', 'tap',
  'scroll', 'swipe', 'type', 'write', 'draw', 'paint', 'sketch', 'render',
]

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split normalized text into a sorted, deduped content-word set. */
function contentWords(text: string): string[] {
  const words = normalizeText(text).split(' ').filter(Boolean)
  const seen = new Set<string>()
  for (const w of words) {
    if (!STOPWORDS.has(w)) seen.add(w)
  }
  return Array.from(seen).sort()
}

/** Extract camera-move tokens present in the normalized text, sorted + deduped. */
function cameraTokens(text: string): string[] {
  const norm = normalizeText(text)
  const found = new Set<string>()
  for (const token of CAMERA_TOKENS) {
    const re = new RegExp(`(^|[^\\p{L}])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu')
    if (re.test(norm)) found.add(token)
  }
  return Array.from(found).sort()
}

/** Extract action-verb tokens present in the normalized text, sorted + deduped. */
function actionTokens(text: string): string[] {
  const norm = normalizeText(text)
  const found = new Set<string>()
  for (const verb of ACTION_VERBS) {
    const re = new RegExp(`(^|[^\\p{L}])${verb}([^\\p{L}]|$)`, 'iu')
    if (re.test(norm)) found.add(verb)
  }
  return Array.from(found).sort()
}

/**
 * Build a comparable fingerprint from a scenario. `scenario` may be the full
 * scenario text or an array of per-plan strings. `subjectCombo` is the
 * product/character identity key — retained as metadata only.
 */
export function buildScenarioFingerprint(
  scenario: string | string[],
  subjectCombo = '',
): ScenarioFingerprint {
  const parts = Array.isArray(scenario)
    ? scenario.map((s) => s.trim()).filter(Boolean)
    : scenario
        .split(/\r?\n?\s*===SCENE===\s*\r?\n?/i)
        .map((s) => s.trim())
        .filter(Boolean)

  const full = parts.join(' ')
  const opening = parts[0] ?? ''
  const ending = parts[parts.length - 1] ?? ''

  const concept = Array.from(new Set([...contentWords(full), ...actionTokens(full)])).sort()

  return {
    opening: normalizeText(opening),
    ending: normalizeText(ending),
    concept,
    camera: cameraTokens(full),
    subjectCombo: subjectCombo.trim().toLowerCase(),
  }
}

/** Jaccard similarity over two sorted word sets, in [0, 1]. */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0
  const sa = new Set(a)
  const sb = new Set(b)
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : inter / union
}

/** Jaccard similarity over two normalized text strings, in [0, 1]. */
function textJaccard(a: string, b: string): number {
  return jaccard(contentWords(a), contentWords(b))
}

/**
 * Fast structural similarity between two fingerprints, in [0, 1].
 *
 * Identity-independent: product/character is NOT considered, so a re-told story
 * with a new identity still scores high. The score is a weighted blend of
 * concept (story + action), camera progression, opening, and ending overlap.
 */
export function fingerprintSimilarity(a: ScenarioFingerprint, b: ScenarioFingerprint): number {
  const concept = jaccard(a.concept, b.concept)
  const camera = jaccard(a.camera, b.camera)
  const opening = textJaccard(a.opening, b.opening)
  const ending = textJaccard(a.ending, b.ending)
  return 0.4 * concept + 0.25 * camera + 0.2 * opening + 0.15 * ending
}

/**
 * Build the prompt for the semantic judge (Stage 2). The judge decides whether
 * two scenarios describe the SAME film concept even when wording, camera moves,
 * or product/character identity differ.
 */
export function buildSemanticJudgePrompt(a: string, b: string): string {
  return [
    'You are a duplicate-detection judge for film scenarios.',
    'Determine whether the two scenarios below describe the SAME film concept — the same story premise, the same main action, and the same narrative arc — even if the wording, camera moves, or product/character identity differ.',
    'Two scenarios are duplicates if a viewer would recognize them as the same film idea re-told.',
    '',
    'SCENARIO A:',
    a,
    '',
    'SCENARIO B:',
    b,
    '',
    'Answer with exactly one word: "duplicate" or "different".',
  ].join('\n')
}

/**
 * Parse a semantic judge's raw output. Returns true for "duplicate", false for
 * "different", and null when the output is unparseable (caller must fail closed).
 */
export function parseSemanticJudgeResult(raw: string): boolean | null {
  const t = raw.trim().toLowerCase()
  if (/\bduplicate\b/.test(t)) return true
  if (/\bdifferent\b/.test(t)) return false
  return null
}

export interface AntiDuplicateResult {
  /** True when the scenario was accepted (not a duplicate, or a retry diverged). */
  accepted: boolean
  /** The accepted scenario parts (empty when rejected). */
  scenes: string[]
  /** Number of generation attempts made (1 = first try accepted). */
  attempts: number
  /** Why the scenario was rejected (for a readable error). */
  reason?: 'duplicate' | 'empty' | 'judge-error'
}

/**
 * Run the two-stage anti-duplicate acceptance loop for a freshly written
 * scenario.
 *
 * For each attempt the candidate is fingerprinted and compared against the
 * user's history. Entries above `hardThreshold` are hard duplicates; entries in
 * the ambiguous band [fastThreshold, hardThreshold) are resolved by the
 * semantic judge. A duplicate is regenerated with an explicit variation
 * instruction, up to `maxAttempts` total attempts. If the last retry is still a
 * duplicate, the scenario is NOT accepted (empty scenes) so the caller can
 * surface a readable error and never enter it into UI/history.
 *
 * `regenerate` receives the variation instruction and returns the new scenario
 * parts (or null when regeneration failed). `judge` receives two scenario texts
 * and returns true when they are the same concept. Both are injected so the
 * loop is pure and unit-testable.
 */
export async function runAntiDuplicatePass(
  candidateScenes: string[],
  history: ScenarioHistoryEntry[],
  regenerate: (instruction: string) => Promise<string[] | null>,
  judge: (candidateText: string, historyText: string) => Promise<boolean>,
  maxAttempts = 3,
  fastThreshold = 0.5,
  hardThreshold = 0.85,
): Promise<AntiDuplicateResult> {
  const parts = candidateScenes.map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return { accepted: false, scenes: [], attempts: 0, reason: 'empty' }

  let current = parts
  let attempts = 1

  while (true) {
    const fp = buildScenarioFingerprint(current)
    const candidateText = current.join('\n\n')

    let duplicate = false
    for (const entry of history) {
      const fast = fingerprintSimilarity(fp, entry.fingerprint)
      if (fast >= hardThreshold) {
        duplicate = true
        break
      }
      if (fast >= fastThreshold) {
        const isDup = await judge(candidateText, entry.scenarioText)
        if (isDup) {
          duplicate = true
          break
        }
      }
    }

    if (!duplicate) {
      return { accepted: true, scenes: current, attempts }
    }

    if (attempts >= maxAttempts) {
      return { accepted: false, scenes: [], attempts, reason: 'duplicate' }
    }

    const next = await regenerate(buildVariationInstruction())
    if (!next || next.length === 0) {
      return { accepted: false, scenes: [], attempts, reason: 'empty' }
    }
    current = next.map((s) => s.trim()).filter(Boolean)
    attempts += 1
  }
}

/**
 * Build the explicit corrective instruction used when a scenario is rejected
 * as a duplicate. It forces a genuinely different concept — not synonym swaps —
 * by naming the dimensions that must change.
 */
export function buildVariationInstruction(): string {
  return [
    'VARIATION REQUIRED — the scenario you produced is too similar to a film this user already made.',
    'Produce a GENUINELY different film. Change at least one of these at the story level, not just the wording:',
    '- the STORY CONCEPT (a different premise, not the same idea reworded),',
    '- the OPENING (a different hook and first impression),',
    '- the MAIN ACTION (different things happen on screen),',
    '- the CAMERA FLOW (a different shot progression), or',
    '- the ENDING/PAYOFF (a different resolution or call-to-action).',
    'Do NOT merely swap synonyms or reorder the same beats. The new scenario must read as a different film.',
  ].join(' ')
}
