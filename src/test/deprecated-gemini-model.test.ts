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
//
// Direct Gemini Developer API call sites are covered too: affected functions
// must import the centralized policy instead of embedding retired
// `models/gemini-2.5-*` identifiers in request URLs.

const functionsDir = resolve(process.cwd(), 'supabase/functions')

// The exact deprecated chat-model literal, including the closing quote so the
// `-image` and `-preview-tts` variants are excluded.
const DEPRECATED_TEXT_MODEL = 'google/gemini-2.5-flash"'
const DEPRECATED_DIRECT_MODELS = /models\/gemini-2\.5-(?:flash|pro):generateContent/

// Returns [functionName, source] pairs so a failure can name the offending
// function instead of dumping whole file bodies into the assertion diff.
function deployedFunctionSources(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const e of readdirSync(functionsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    try {
      out.push([e.name, readFileSync(resolve(functionsDir, e.name, 'index.ts'), 'utf8')])
    } catch {
      // no index.ts (shared dir, or a function laid out differently) -- skip
    }
  }
  return out
}

describe('deprecated gemini-2.5-flash text model', () => {
  it('is not referenced by any deployed edge function', () => {
    const offenders: string[] = []
    for (const [name, src] of deployedFunctionSources()) {
      if (src.includes(DEPRECATED_TEXT_MODEL)) offenders.push(name)
    }
    expect(offenders).toEqual([])
  })

  it('does not embed retired direct Gemini Generate Content model IDs', () => {
    const offenders = deployedFunctionSources()
      .filter(([name]) => name === 'video-analyze' || name === 'copyright-check')
      .filter(([, src]) => DEPRECATED_DIRECT_MODELS.test(src))
      .map(([name]) => name)
    expect(offenders).toEqual([])
  })

  it('still scans a meaningful number of functions', () => {
    // Guards the guard: if the directory walk silently stops finding sources
    // (layout change, rename, cwd drift) the model check above would pass
    // vacuously. It scanned 30+ functions when written.
    expect(deployedFunctionSources().length).toBeGreaterThan(20)
  })
})
