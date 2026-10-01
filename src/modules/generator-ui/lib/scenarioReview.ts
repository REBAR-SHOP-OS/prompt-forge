import type { FilmPlan } from './makeFilmWizard'

/**
 * Languages offered in the Scenario Review dialog. English is the original
 * (no AI call); every other language is produced by the `translate-text` edge
 * function. The list is intentionally a superset of the languages the
 * translate-text function supports.
 */
export const REVIEW_LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'فارسی' },
  { code: 'ar', label: 'العربية' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
]

/** Persian and Arabic are rendered right-to-left. */
export function isRtlLang(lang: string): boolean {
  return lang === 'fa' || lang === 'ar'
}

/**
 * English display labels for the Persian film-type values. The stored value is
 * never changed — this mapping is only used to render the review in English.
 */
const FILM_TYPE_EN: Record<string, string> = {
  'Advertisement': 'Advertisement',
  'Product Showcase': 'Product Showcase',
  'Manufacturing Process': 'Manufacturing Process',
  'Project Application': 'Project Application',
  'Comparison': 'Comparison',
  'Brand Story': 'Brand Story',
  // Legacy Persian values (PR #135) kept for backward compatibility.
  'تبلیغاتی': 'Advertisement',
  'معرفی محصول': 'Product Showcase',
  'فرآیند ساخت': 'Manufacturing Process',
  'کاربرد در پروژه': 'Project Application',
  'مقایسه‌ای': 'Comparison',
  'برند': 'Brand Story',
}

export function englishFilmType(value: string | null | undefined): string {
  if (!value) return ''
  return FILM_TYPE_EN[value] ?? value
}

/**
 * Strip raw Markdown emphasis/backticks so `**Visuals:**` renders as `Visuals:`
 * and `**SCENE 1 (0-15 seconds)**` renders as plain text. Only the common
 * emphasis/code markers are removed; the surrounding text is preserved.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .trim()
}

/**
 * Build the unified English scenario text from the ordered plans. Each plan is
 * prefixed with a `SHOT n (start–end s)` boundary and its Markdown is stripped,
 * then the whole thing is joined into one continuous block.
 */
export function buildUnifiedScenario(plans: FilmPlan[]): string {
  return plans
    .map((plan, i) => {
      const start = i * plan.durationSeconds
      const end = start + plan.durationSeconds
      const body = stripMarkdown(plan.scenarioText)
      return `SHOT ${i + 1} (${start}–${end}s)\n${body}`
    })
    .join('\n\n')
}

/**
 * Present the timing-aware render plans as one continuous film scenario.
 * Shot labels stay internal; the user reviews one coherent narrative.
 */
export function buildContinuousScenario(plans: FilmPlan[]): string {
  return plans
    .map((plan) => stripMarkdown(plan.scenarioText))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Re-apply an edited continuous scenario to the existing render-plan slots.
 * Blank-line boundaries are preserved when possible; otherwise words are
 * distributed contiguously so the hidden timing plan still covers the full
 * user-approved story.
 */
export function redistributeContinuousScenario(
  scenario: string,
  plans: FilmPlan[],
): FilmPlan[] {
  if (plans.length === 0) return []
  const normalized = stripMarkdown(scenario).trim()
  if (!normalized) return plans

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  let sections: string[]
  if (paragraphs.length === plans.length) {
    sections = paragraphs
  } else {
    const words = normalized.split(/\s+/).filter(Boolean)
    sections = plans.map((_, index) => {
      const start = Math.floor((index * words.length) / plans.length)
      const end = Math.floor(((index + 1) * words.length) / plans.length)
      return words.slice(start, end).join(' ').trim()
    })
  }

  return plans.map((plan, index) => ({
    ...plan,
    scenarioText: sections[index] || plan.scenarioText,
  }))
}

/**
 * Ask the image model for one contact-sheet-style storyboard image covering
 * the whole film. The ordered panel brief is internal guidance; no shot labels
 * or captions should appear in the generated image.
 */
export function buildStoryboardPrompt(
  scenario: string,
  plans: FilmPlan[],
  durationSeconds: number,
): string {
  const panelBrief = plans
    .map((plan, index) => `PANEL ${index + 1}: ${stripMarkdown(plan.scenarioText)}`)
    .join('\n')

  return [
    `Create ONE cinematic storyboard contact sheet for a ${durationSeconds}-second film.`,
    `The single image must contain exactly ${plans.length} equal-sized visual panels in a clean grid, ordered left-to-right and top-to-bottom.`,
    'Each panel is a consecutive moment from the same continuous film. Preserve the exact same product, character identity, environment, palette, lighting, and visual style across every panel.',
    'Use clear panel separation, but include no written captions, shot numbers, labels, logos, watermarks, or readable text anywhere in the image.',
    `FULL FILM SCENARIO:\n${stripMarkdown(scenario)}`,
    `ORDERED VISUAL BEATS:\n${panelBrief}`,
  ].join('\n\n')
}

/**
 * Split a long scenario into chunks that each stay under `maxChars` without
 * splitting a shot mid-way. Chunks are cut on blank-line (shot) boundaries so
 * the translate-text edge function's 5000-char limit is never exceeded while
 * shot structure is preserved.
 */
export function chunkScenario(text: string, maxChars = 5000): string[] {
  if (text.length <= maxChars) return [text]
  const blocks = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current)
      current = block
    } else {
      current = current ? `${current}\n\n${block}` : block
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/** True when the text contains non-Latin script (Persian, Arabic, Cyrillic, CJK…). */
export function hasNonLatin(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF\u4E00-\u9FFF]/.test(text)
}
