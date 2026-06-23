// Narration helpers shared by the card list and the Narration dialog.
//
// The scenario / ad writer weaves spoken narration into a scene prompt in one
// of two shapes:
//   1. A labeled line, e.g. `Narration: "..."` (the label is localized — see
//      NARRATION_LABELS) — with or without surrounding quotes.
//   2. Inline quoted dialogue: `"..."`, smart quotes `“...”`, or guillemets
//      `«...»`.
// `extractNarration` returns the de-duplicated spoken lines from either shape.

// Localized narration labels — must mirror NARRATION_LABELS in
// supabase/functions/scenario-write/index.ts.
export const NARRATION_LABELS: string[] = [
  'Narration',
  'نریشن',
  'التعليق الصوتي',
  'Anlatım',
  'Narración',
]

// Strip a single layer of surrounding quotes (straight/smart/guillemets).
function stripQuotes(raw: string): string {
  const t = raw.trim()
  const m = t.match(/^["“«](.*)["”»]$/s)
  return (m ? m[1] : t).trim()
}

export function extractNarration(prompt: string | null | undefined): string[] {
  if (!prompt) return []
  const lines: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const text = stripQuotes(raw)
    if (text.length < 2) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    lines.push(text)
  }

  // 1) Labeled narration lines: `Narration: ...` (localized label), capturing
  //    the rest of the line whether or not it is wrapped in quotes.
  const labelAlt = NARRATION_LABELS
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  // The label may appear at the start of a line OR mid-paragraph after a
  // sentence/clause boundary (e.g. "...next shot. Narration: \"...\"").
  const labelRe = new RegExp(`(?:^|[\\n.!?…])\\s*(?:${labelAlt})\\s*[:：]\\s*(.+)$`, 'gim')
  let lm: RegExpExecArray | null
  while ((lm = labelRe.exec(prompt)) !== null) {
    push(lm[1] ?? '')
  }

  // 2) Generic spoken-line labels the scenario writer also emits, with or
  //    without quotes:
  //      - `Narrator:` / `Voiceover:` / `VO:` (+ localized)
  //      - `<Speaker> says:` / `<Speaker> say:` (e.g. "Character says:")
  //    Localized "says" verbs cover fa/ar/tr/es/fr.
  const SPEAKER_LABELS = [
    'Narrator', 'Voiceover', 'Voice-over', 'Voice over', 'VO',
    'راوی', 'گوینده', 'صدای راوی', 'راوي', 'التعليق', 'Anlatıcı', 'Narrador',
  ]
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const speakerLabelRe = new RegExp(`(?:^|[\\n.!?…])\\s*(?:${SPEAKER_LABELS})\\s*[:：]\\s*(.+)$`, 'gim')
  while ((lm = speakerLabelRe.exec(prompt)) !== null) {
    push(lm[1] ?? '')
  }

  // `<Speaker> says:` / `... says,` style attributions in prose. Capture the
  // remainder of the line; quote-stripping handles the common quoted form.
  const SAYS_VERBS = [
    'says', 'say', 'said', 'tells', 'narrates', 'speaks',
    'می‌گوید', 'میگوید', 'می گوید', 'می‌گه', 'میگه', 'يقول', 'تقول', 'der', 'diyor', 'dice', 'dit',
  ]
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const saysRe = new RegExp(`(?:${SAYS_VERBS})\\s*[:：,،]?\\s*("[^"]+"|“[^”]+”|«[^»]+»)`, 'giu')
  while ((lm = saysRe.exec(prompt)) !== null) {
    push(lm[1] ?? '')
  }

  // 3) Inline quoted dialogue (catch-all for anything still in quotes).
  const quoteRe = /"([^"]+)"|“([^”]+)”|«([^»]+)»/g
  let m: RegExpExecArray | null
  while ((m = quoteRe.exec(prompt)) !== null) {
    push(m[1] ?? m[2] ?? m[3] ?? '')
  }

  return lines
}

// Normalize text for a forgiving comparison: lowercase, strip diacritics,
// drop punctuation, collapse whitespace. Works for Latin and Arabic/Persian
// script (Arabic diacritics removed; Arabic/Persian letter variants folded).
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    // Latin combining marks + Arabic/Persian diacritics (harakat, tatweel).
    .replace(/[\u0300-\u036f\u064b-\u0652\u0670\u0640]/g, '')
    // Fold Arabic/Persian letter variants.
    .replace(/[ىی]/g, 'ي')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    // Drop everything that isn't a letter, number, or space.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type DiffToken = {
  /** Original display text for this token. */
  text: string
  /** match = in both; missing = only in prompt; extra = only on film. */
  kind: 'match' | 'missing' | 'extra'
}

export type NarrationCheck = {
  status: 'ok' | 'missing-on-film' | 'extra-on-film' | 'mismatch' | 'none'
  similarity: number // 0..1
  matchPercent: number // 0..100
  errorPercent: number // 0..100
  missingWords: string[] // in prompt, not on film
  extraWords: string[] // on film, not in prompt
  diff: DiffToken[] // word-level aligned diff (prompt vs film)
  message: string
}

// Jaccard-style token overlap on normalized words: robust to ordering and
// minor wording, deterministic, no AI cost.
function similarity(a: string, b: string): number {
  const ta = new Set(normalizeForCompare(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeForCompare(b).split(' ').filter(Boolean))
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  return union === 0 ? 1 : inter / union
}

// Tokenize keeping both the display text and a normalized key for comparison.
function tokenize(text: string): { raw: string; norm: string }[] {
  return (text ?? '')
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeForCompare(raw) }))
    .filter((t) => t.norm.length > 0)
}

// Word-level diff via LCS alignment on normalized tokens. Returns the aligned
// token stream plus error metrics (WER-style) between the prompt narration
// (expected) and the on-film transcript (actual).
export function diffNarration(
  expected: string,
  actual: string,
): {
  diff: DiffToken[]
  matched: number
  missing: number
  extra: number
  matchPercent: number
  errorPercent: number
} {
  const a = tokenize(expected) // prompt (baseline)
  const b = tokenize(actual) // film
  const n = a.length
  const m = b.length

  // LCS dynamic-programming table on normalized tokens.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].norm === b[j].norm
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const diff: DiffToken[] = []
  let matched = 0
  let missing = 0
  let extra = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].norm === b[j].norm) {
      diff.push({ text: a[i].raw, kind: 'match' })
      matched++
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ text: a[i].raw, kind: 'missing' })
      missing++
      i++
    } else {
      diff.push({ text: b[j].raw, kind: 'extra' })
      extra++
      j++
    }
  }
  while (i < n) {
    diff.push({ text: a[i].raw, kind: 'missing' })
    missing++
    i++
  }
  while (j < m) {
    diff.push({ text: b[j].raw, kind: 'extra' })
    extra++
    j++
  }

  const denom = 2 * matched + missing + extra
  const errorPercent = denom === 0 ? 0 : Math.round(((missing + extra) / denom) * 100)
  const matchPercent = 100 - errorPercent
  return { diff, matched, missing, extra, matchPercent, errorPercent }
}

// Compare the expected (prompt) narration with the actual (on-film) transcript.
export function compareNarration(
  promptLines: string[],
  filmTranscript: string,
): NarrationCheck {
  const expected = promptLines.join(' ').trim()
  const actual = (filmTranscript ?? '').trim()
  const hasExpected = normalizeForCompare(expected).length > 0
  const hasActual = normalizeForCompare(actual).length > 0

  const empty = { missingWords: [] as string[], extraWords: [] as string[], diff: [] as DiffToken[] }

  if (!hasExpected && !hasActual) {
    return {
      status: 'none', similarity: 1, matchPercent: 100, errorPercent: 0, ...empty,
      message: 'This card has no narration in the prompt and none on the film.',
    }
  }
  if (hasExpected && !hasActual) {
    return {
      status: 'missing-on-film', similarity: 0, matchPercent: 0, errorPercent: 100,
      missingWords: tokenize(expected).map((t) => t.raw), extraWords: [],
      diff: tokenize(expected).map((t) => ({ text: t.raw, kind: 'missing' as const })),
      message: 'The prompt has narration, but no speech was detected on the film.',
    }
  }
  if (!hasExpected && hasActual) {
    return {
      status: 'extra-on-film', similarity: 0, matchPercent: 0, errorPercent: 100,
      missingWords: [], extraWords: tokenize(actual).map((t) => t.raw),
      diff: tokenize(actual).map((t) => ({ text: t.raw, kind: 'extra' as const })),
      message: "The film contains narration that isn't written in the prompt.",
    }
  }

  const sim = similarity(expected, actual)
  const d = diffNarration(expected, actual)
  const missingWords = d.diff.filter((t) => t.kind === 'missing').map((t) => t.text)
  const extraWords = d.diff.filter((t) => t.kind === 'extra').map((t) => t.text)

  if (d.matchPercent >= 80) {
    return {
      status: 'ok', similarity: sim, matchPercent: d.matchPercent, errorPercent: d.errorPercent,
      missingWords, extraWords, diff: d.diff,
      message: `The on-film narration matches the prompt (${d.matchPercent}% match).`,
    }
  }
  return {
    status: 'mismatch', similarity: sim, matchPercent: d.matchPercent, errorPercent: d.errorPercent,
    missingWords, extraWords, diff: d.diff,
    message: `The on-film narration differs from the prompt — ${d.errorPercent}% different. Review the highlighted words below.`,
  }
}

