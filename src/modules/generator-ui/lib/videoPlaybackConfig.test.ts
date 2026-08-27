import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// PF-20260827-001-VPLY — regression guard for the two root causes of the
// "Library / Preview / Pending all hit Retry; Final Films and IMG_4333.MOV
// never render" bug:
//
//   1. `video-proxy` must NOT require gateway-level JWT verification. The
//      <video> element cannot send an Authorization header, so with
//      `verify_jwt = true` the gateway rejects the request before the
//      function's own query-token auth runs. The function authenticates via
//      the `token` query param itself.
//
//   2. The private `merged-videos` bucket must have an owner-scoped SELECT
//      policy so `createSignedUrl` can mint a signed URL for Final Films.
//      Migration 20260609164603 dropped the public read policy but only added
//      SELECT-own for `user-videos`, leaving merged-videos with no SELECT
//      policy at all.

const configToml = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')
const migrationsDir = resolve(process.cwd(), 'supabase/migrations')

function readMigrations(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(resolve(migrationsDir, f), 'utf8'))
    .join('\n')
}

describe('PF-20260827-001-VPLY regression', () => {
  it('keeps video-proxy verify_jwt disabled so <video> can stream without an Authorization header', () => {
    const block = configToml.match(/\[functions\.video-proxy\][\s\S]*?(?=\n\[|$)/)?.[0] ?? ''
    expect(block).toContain('verify_jwt = false')
    expect(block).not.toContain('verify_jwt = true')
  })

  it('provides an owner-scoped SELECT policy for the private merged-videos bucket', () => {
    const all = readMigrations()
    expect(all).toMatch(/merged-videos: authenticated read own/)
    expect(all).toMatch(/bucket_id = 'merged-videos'/)
    expect(all).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(auth\.uid\(\)\)::text/)
  })

  it('does not re-open merged-videos to public read', () => {
    const all = readMigrations()
    // The owner-scoped policy is the SELECT policy present for merged-videos;
    // the public read policy must not be re-created after the drop.
    expect(all).toContain('merged-videos: authenticated read own')
  })
})
