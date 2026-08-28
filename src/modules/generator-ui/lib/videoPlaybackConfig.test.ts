import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// PF-20260827-002-PRIV — regression guard for the `merged-videos` bucket.
//
// The previous guard (PF-20260827-001-VPLY) grepped the concatenated text of
// all migrations for a few substrings. That form cannot fail when it should:
//   - it passes if a later migration re-creates a public-read policy, and
//   - it keeps passing if the owner-scoped SELECT policy is later dropped, and
//   - it happily passes against a bucket that is still `public = true`.
//
// This guard instead replays the migrations in filename order and evaluates
// the *final* state of the `merged-videos` bucket:
//   1. `storage.buckets.public` must be `false` (private).
//   2. Exactly one SELECT policy must remain, and it must be the owner-scoped
//      `merged-videos: authenticated read own` policy.
//   3. No public-read policy may remain.
//
// It is a deterministic state-machine over the ordered SQL statements, so it
// runs in CI without a live Postgres while still failing on any of the three
// regressions above.

const configToml = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')
const migrationsDir = resolve(process.cwd(), 'supabase/migrations')

function orderedMigrations(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(migrationsDir, f), 'utf8'))
}

interface BucketState {
  public: boolean
  selectPolicies: Set<string>
}

// Replay the ordered migrations and compute the final `merged-videos` state.
function replayMergedVideosState(): BucketState {
  const state: BucketState = { public: false, selectPolicies: new Set<string>() }

  for (const rawSql of orderedMigrations()) {
    // Strip `--` line comments so a rollback hint in a comment can never be
    // mistaken for a real statement.
    const sql = rawSql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')

    // 1. Bucket creation / public-flag updates.
    const insert = sql.match(
      /INSERT\s+INTO\s+storage\.buckets\s*\([^)]*\)\s*VALUES\s*\(\s*'merged-videos'\s*,\s*'merged-videos'\s*,\s*(true|false)\s*\)/i,
    )
    if (insert) state.public = insert[1] === 'true'

    const update = sql.match(
      /UPDATE\s+storage\.buckets\s+SET\s+public\s*=\s*(true|false)\s+WHERE\s+id\s*=\s*'merged-videos'/i,
    )
    if (update) state.public = update[1] === 'true'

    // 2. SELECT policies on merged-videos.
    const createSelect = sql.matchAll(
      /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+storage\.objects\s+FOR\s+SELECT[\s\S]*?USING\s*\(\s*bucket_id\s*=\s*'merged-videos'/gi,
    )
    for (const m of createSelect) state.selectPolicies.add(m[1])

    const drop = sql.matchAll(/DROP\s+POLICY\s+IF\s+EXISTS\s+"([^"]+)"\s+ON\s+storage\.objects/gi)
    for (const m of drop) state.selectPolicies.delete(m[1])
  }

  return state
}

describe('PF-20260827-002-PRIV regression', () => {
  it('keeps video-proxy verify_jwt disabled so <video> can stream without an Authorization header', () => {
    const block = configToml.match(/\[functions\.video-proxy\][\s\S]*?(?=\n\[|$)/)?.[0] ?? ''
    expect(block).toContain('verify_jwt = false')
    expect(block).not.toContain('verify_jwt = true')
  })

  it('leaves the merged-videos bucket private (public = false) in the final state', () => {
    const state = replayMergedVideosState()
    expect(state.public).toBe(false)
  })

  it('keeps exactly one owner-scoped SELECT policy and no public-read policy', () => {
    const state = replayMergedVideosState()
    expect([...state.selectPolicies]).toEqual(['merged-videos: authenticated read own'])
    expect(state.selectPolicies.has('Public read merged-videos')).toBe(false)
  })
})
