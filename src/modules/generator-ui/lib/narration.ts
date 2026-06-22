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
  const labelRe = new RegExp(`^\\s*(?:${labelAlt})\\s*[:：]\\s*(.+)$`, 'gim')
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
  const speakerLabelRe = new RegExp(`^\\s*(?:${SPEAKER_LABELS})\\s*[:：]\\s*(.+)$`, 'gim')
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

export type NarrationCheck = {
  status: 'ok' | 'missing-on-film' | 'extra-on-film' | 'mismatch' | 'none'
  similarity: number // 0..1
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

// Compare the expected (prompt) narration with the actual (on-film) transcript.
export function compareNarration(
  promptLines: string[],
  filmTranscript: string,
): NarrationCheck {
  const expected = promptLines.join(' ').trim()
  const actual = (filmTranscript ?? '').trim()
  const hasExpected = normalizeForCompare(expected).length > 0
  const hasActual = normalizeForCompare(actual).length > 0

  if (!hasExpected && !hasActual) {
    return { status: 'none', similarity: 1, message: 'This card has no narration in the prompt and none on the film.' }
  }
  if (hasExpected && !hasActual) {
    return { status: 'missing-on-film', similarity: 0, message: 'The prompt has narration, but no speech was detected on the film.' }
  }
  if (!hasExpected && hasActual) {
    return { status: 'extra-on-film', similarity: 0, message: "The film contains narration that isn't written in the prompt." }
  }

  const sim = similarity(expected, actual)
  if (sim >= 0.8) {
    return { status: 'ok', similarity: sim, message: 'The on-film narration matches the prompt.' }
  }
  return {
    status: 'mismatch',
    similarity: sim,
    message: 'The on-film narration differs from the prompt — review both below.',
  }
}
