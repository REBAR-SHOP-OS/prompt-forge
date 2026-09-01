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
// KNOWN GAP -- this guard covers the Lovable AI gateway call sites ONLY.
// It does NOT cover functions that call the Gemini Developer API directly at
// generativelanguage.googleapis.com, because those build the model into a
// template-literal URL rather than a `"google/..."` string literal. Two
// deployed functions are in that category and are NOT protected here:
//
//   - video-analyze:    models/gemini-2.5-flash
//   - copyright-check:  models/gemini-2.5-pro
//
// `models/gemini-2.5-flash` is the SAME retired model as
// `google/gemini-2.5-flash`, not a separate id -- it 404'd on the Developer
// API during the 2026-07-09 early-retirement incident alongside
// gemini-2.5-pro, and both hit hard retirement on 2026-10-16. Passing this
// test therefore does not mean the deployment is clear of the retired model.
// Migrating those two needs a replacement id verified against the Developer
// API (the gateway's `google/gemini-3-flash-preview` is a gateway id and is
// not valid there), so it is deliberately left to a follow-up.

const functionsDir = resolve(process.cwd(), 'supabase/functions')

// The exact deprecated chat-model literal, including the closing quote so the
// `-image` and `-preview-tts` variants are excluded.
const DEPRECATED_TEXT_MODEL = 'google/gemini-2.5-flash"'

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

  it('still scans a meaningful number of functions', () => {
    // Guards the guard: if the directory walk silently stops finding sources
    // (layout change, rename, cwd drift) the model check above would pass
    // vacuously. It scanned 30+ functions when written.
    expect(deployedFunctionSources().length).toBeGreaterThan(20)
  })
})
