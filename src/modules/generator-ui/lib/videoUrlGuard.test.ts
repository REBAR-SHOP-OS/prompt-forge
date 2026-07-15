/**
 * Regression tests for narration-review SSRF guard logic.
 *
 * The edge function's isAllowedVideoUrl() function is duplicated here
 * (it's a one-liner) so we can validate the allowlist spec without
 * importing from the Deno runtime. If the edge-function logic ever
 * changes, update both files together.
 */
import { describe, it, expect } from 'vitest'

// Mirror of supabase/functions/narration-review/index.ts isAllowedVideoUrl().
function isAllowedVideoUrl(url: string, allowedHost: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === allowedHost
  } catch {
    return false
  }
}

const SUPABASE_HOST = 'abcdefghijklmnop.supabase.co' // representative project host

describe('isAllowedVideoUrl — SSRF guard', () => {
  it('allows https:// storage URLs on the project Supabase host', () => {
    const url = `https://${SUPABASE_HOST}/storage/v1/object/public/final-renders/clip.mp4`
    expect(isAllowedVideoUrl(url, SUPABASE_HOST)).toBe(true)
  })

  it('allows https:// with query params on the project Supabase host', () => {
    const url = `https://${SUPABASE_HOST}/storage/v1/object/sign/videos/clip.mp4?token=x`
    expect(isAllowedVideoUrl(url, SUPABASE_HOST)).toBe(true)
  })

  it('rejects http:// even for the correct Supabase host', () => {
    const url = `http://${SUPABASE_HOST}/storage/v1/object/public/clip.mp4`
    expect(isAllowedVideoUrl(url, SUPABASE_HOST)).toBe(false)
  })

  it('rejects a different Supabase project host', () => {
    const url = 'https://other-project.supabase.co/storage/v1/object/public/clip.mp4'
    expect(isAllowedVideoUrl(url, SUPABASE_HOST)).toBe(false)
  })

  it('rejects an arbitrary external https:// URL', () => {
    expect(isAllowedVideoUrl('https://example.com/video.mp4', SUPABASE_HOST)).toBe(false)
  })

  it('rejects an SSRF target: link-local metadata endpoint', () => {
    expect(isAllowedVideoUrl('https://169.254.169.254/latest/meta-data/', SUPABASE_HOST)).toBe(false)
  })

  it('rejects an SSRF target: localhost', () => {
    expect(isAllowedVideoUrl('https://localhost/internal', SUPABASE_HOST)).toBe(false)
  })

  it('rejects an SSRF target: 127.0.0.1', () => {
    expect(isAllowedVideoUrl('https://127.0.0.1/internal', SUPABASE_HOST)).toBe(false)
  })

  it('rejects an SSRF target: internal LAN IP', () => {
    expect(isAllowedVideoUrl('https://10.0.0.1/clip.mp4', SUPABASE_HOST)).toBe(false)
  })

  it('rejects a non-URL string', () => {
    expect(isAllowedVideoUrl('not-a-url', SUPABASE_HOST)).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isAllowedVideoUrl('', SUPABASE_HOST)).toBe(false)
  })

  it('rejects a blob: URL', () => {
    expect(isAllowedVideoUrl('blob:https://example.com/abc-123', SUPABASE_HOST)).toBe(false)
  })

  it('rejects a data: URL', () => {
    expect(isAllowedVideoUrl('data:video/mp4;base64,AAAA', SUPABASE_HOST)).toBe(false)
  })

  it('rejects a javascript: URL', () => {
    expect(isAllowedVideoUrl('javascript:alert(1)', SUPABASE_HOST)).toBe(false)
  })

  it('rejects URL with correct host but wrong subdomain prefix', () => {
    // Ensure subdomain tricks can't slip through (e.g. evil.abcdef.supabase.co is different from abcdef.supabase.co)
    const trickUrl = `https://evil.${SUPABASE_HOST}/storage/v1/object/public/clip.mp4`
    expect(isAllowedVideoUrl(trickUrl, SUPABASE_HOST)).toBe(false)
  })

  it('rejects URL with correct host embedded in path of another host', () => {
    // https://evil.com/redirect?to=https://abcdef.supabase.co — hostname is evil.com
    const trickUrl = `https://evil.com/redirect?url=https://${SUPABASE_HOST}/clip.mp4`
    expect(isAllowedVideoUrl(trickUrl, SUPABASE_HOST)).toBe(false)
  })
})
