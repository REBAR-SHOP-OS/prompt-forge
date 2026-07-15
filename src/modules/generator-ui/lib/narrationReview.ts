// Client-side narration review: aligns expected narration against timestamped
// words from STT to produce a structured list of issues with time ranges.
import { normalizeForCompare } from './narration'

export type TimestampedWord = { word: string; start: number; end: number }

export type NarrationIssue = {
  startSeconds: number
  endSeconds: number
  /** Exact text spoken in this time range (may be empty string for missing-only spans). */
  text: string
  /** Human-readable description of the problem. */
  problem: string
  /** What should have been said, when determinable. */
  suggestion?: string
}

export type NarrationReviewStatus =
  | 'pass'          // on-film narration matches expected well enough
  | 'issues'        // one or more problems found
  | 'no-narration'  // no expected narration to compare against
  | 'no-speech'     // no speech detected in the film
  | 'no-video'      // no video available

export type NarrationReviewResult = {
  status: NarrationReviewStatus
  issues: NarrationIssue[]
  matchPercent: number
  transcript: string
}

// Tokenize keeping both the display text and a normalized key.
function tokenize(text: string): { raw: string; norm: string }[] {
  return (text ?? '')
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeForCompare(raw) }))
    .filter((t) => t.norm.length > 0)
}

// LCS-based alignment between expected tokens and timestamped transcript words.
// Returns an aligned sequence where each slot is either a match, a missing
// expected word, or extra transcript words.
type AlignedSlot =
  | { kind: 'match';   expectedRaw: string; word: TimestampedWord }
  | { kind: 'missing'; expectedRaw: string }
  | { kind: 'extra';   word: TimestampedWord }

function alignWords(
  expectedTokens: { raw: string; norm: string }[],
  transcriptWords: TimestampedWord[],
): AlignedSlot[] {
  const a = expectedTokens
  const b = transcriptWords.map((w) => ({ raw: w.word, norm: normalizeForCompare(w.word), ts: w }))
  const n = a.length
  const m = b.length

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].norm === b[j].norm
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const slots: AlignedSlot[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].norm === b[j].norm) {
      slots.push({ kind: 'match', expectedRaw: a[i].raw, word: b[j].ts })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      slots.push({ kind: 'missing', expectedRaw: a[i].raw })
      i++
    } else {
      slots.push({ kind: 'extra', word: b[j].ts })
      j++
    }
  }
  while (i < n) { slots.push({ kind: 'missing', expectedRaw: a[i].raw }); i++ }
  while (j < m) { slots.push({ kind: 'extra', word: b[j].ts }); j++ }

  return slots
}

// Group consecutive non-match slots into contiguous issues. A mix of missing
// and extra in the same run is a "wrong words" issue. Pure missing is "not
// spoken". Pure extra is "unexpected speech".
function groupToIssues(
  slots: AlignedSlot[],
  allTranscriptWords: TimestampedWord[],
): NarrationIssue[] {
  const issues: NarrationIssue[] = []

  // Gather the global time bounds once — used for missing-only spans.
  const firstTs = allTranscriptWords[0]?.start ?? 0
  const lastTs = allTranscriptWords[allTranscriptWords.length - 1]?.end ?? 0

  let run: AlignedSlot[] = []
  let runStart = -1

  const flush = () => {
    if (run.length === 0) return

    const missingSlots  = run.filter((s): s is AlignedSlot & { kind: 'missing' } => s.kind === 'missing')
    const extraSlots    = run.filter((s): s is AlignedSlot & { kind: 'extra' }   => s.kind === 'extra')

    const missingWords  = missingSlots.map((s) => s.expectedRaw)
    const extraWords    = extraSlots.map((s) => s.word.word)
    const timestampedWords = extraSlots.map((s) => s.word)

    const startSeconds = timestampedWords.length > 0 ? timestampedWords[0].start : firstTs
    const endSeconds   = timestampedWords.length > 0
      ? timestampedWords[timestampedWords.length - 1].end
      : lastTs

    const spokenText   = extraWords.join(' ')

    let problem: string
    let suggestion: string | undefined

    if (missingWords.length > 0 && extraWords.length > 0) {
      // Wrong words: something was said but it doesn't match what was expected.
      problem    = `Wrong narration: expected "${missingWords.join(' ')}", got "${extraWords.join(' ')}"`
      suggestion = missingWords.join(' ')
    } else if (missingWords.length > 0) {
      // Expected words were not spoken at all.
      problem    = `Not spoken: "${missingWords.join(' ')}"`
      suggestion = missingWords.join(' ')
    } else {
      // Extra speech that wasn't in the expected narration.
      problem    = `Unexpected speech: "${extraWords.join(' ')}"`
    }

    issues.push({ startSeconds, endSeconds, text: spokenText, problem, suggestion })
    run = []
    runStart = -1
  }

  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx]
    if (slot.kind === 'match') {
      flush()
    } else {
      if (runStart === -1) runStart = idx
      run.push(slot)
    }
  }
  flush()

  return issues
}

/**
 * Analyze the on-film narration against the expected narration lines and
 * return a structured list of issues with precise time ranges.
 */
export function reviewNarration(
  expectedLines: string[],
  transcriptWords: TimestampedWord[],
  transcript: string,
): NarrationReviewResult {
  const expected = expectedLines.join(' ').trim()
  const hasExpected = normalizeForCompare(expected).length > 0
  const hasTranscript = transcript.trim().length > 0

  if (!hasExpected) {
    return { status: 'no-narration', issues: [], matchPercent: 100, transcript }
  }
  if (!hasTranscript || transcriptWords.length === 0) {
    // All expected narration is missing from the film.
    const expectedTokens = tokenize(expected)
    const durationSecs = 0
    const issues: NarrationIssue[] = expectedTokens.length > 0
      ? [{ startSeconds: 0, endSeconds: durationSecs, text: '', problem: `Narration not spoken on film: "${expected}"`, suggestion: expected }]
      : []
    return { status: 'no-speech', issues, matchPercent: 0, transcript }
  }

  const expectedTokens = tokenize(expected)
  const slots = alignWords(expectedTokens, transcriptWords)

  const matched = slots.filter((s) => s.kind === 'match').length
  const mismatched = slots.filter((s) => s.kind !== 'match').length
  const denom = 2 * matched + mismatched
  const matchPercent = denom === 0 ? 100 : Math.round((2 * matched / denom) * 100)

  if (matchPercent >= 80) {
    return { status: 'pass', issues: [], matchPercent, transcript }
  }

  const issues = groupToIssues(slots, transcriptWords)
  return { status: 'issues', issues, matchPercent, transcript }
}
