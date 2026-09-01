import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression guard: no deployed edge function may call the deprecated
// `google/gemini-2.5-flash` text model through the Lovable AI gateway.
//
// Google began returning 404 for `gemini-2.5-flash` ahead of its official
// 2026-10-16 shutdown. scenario-write (and several sibling functions) still
// referenced it, so "Make Full Film" failed with a generic
// "Edge Function returned a non-2xx status code" on every write. The fix
// migrates those call sites to `google/gemini-3-flash-preview`, the model the
// rest of the codebase already uses (describe-character, day-info, etc.).
//
// This guard scans the deployed function sources and fails if the deprecated
// text-model string reappears. It matches the exact `"google/gemini-2.5-flash"`
// literal (with the closing quote) so the distinct image/TTS variants
// (`gemini-2.5-flash-image`, `gemini-2.5-flash-preview-tts`) are not confused
// with the retired chat model.

const functionsDir = resolve(process.cwd(), 'supabase/functions')

// The exact deprecated chat-model literal, including the closing quote so the
// `-image` and `-preview-tts` variants are excluded.
const DEPRECATED_TEXT_MODEL = 'google/gemini-2.5-flash"'

function deployedFunctionSources(): string[] {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => resolve(functionsDir, e.name, 'index.ts'))
    .filter((p) => {
      try {
        readFileSync(p)
        return true
      } catch {
        return false
      }
    })
    .map((p) => readFileSync(p, 'utf8'))
}

describe('deprecated gemini-2.5-flash text model', () => {
  it('is not referenced by any deployed edge function', () => {
    const offenders: string[] = []
    for (const src of deployedFunctionSources()) {
      if (src.includes(DEPRECATED_TEXT_MODEL)) offenders.push(src)
    }
    expect(offenders).toEqual([])
  })
})
