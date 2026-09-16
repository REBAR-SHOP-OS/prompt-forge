import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('medium backend hardening batch 1', () => {
  it('atomically reserves AI-image quota and records the product credit debit', () => {
    const sql = read('supabase/migrations/20260916150000_medium_backend_hardening.sql')
    expect(sql).toContain('reserved_provider_calls BETWEEN 1 AND 6')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_ai_image_request')
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('reserved_provider_calls <= _daily_provider_call_limit')
    expect(sql).toContain("'ai-image-generate:' || _request_id::text")
    expect(sql).toContain("'ai-image-generate-refund:' || _request_id::text")
    expect(sql).toContain('_refund_credits := GREATEST(_request.credit_cost - _consumed, 0)')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_ai_image_request')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('-- Manual rollback for a coordinated application rollback only:')
    expect(sql).not.toMatch(/^\s*(DELETE|TRUNCATE)\s/im)
  })

  it('executes the transient Veo retry through the persisted compare-and-swap claim', () => {
    const source = read('supabase/functions/_shared/modules/external-api-adapter/service.ts')
    expect(source).toContain('veo transient terminal error — durable retry dispatch')
    expect(source).toContain('dispatchPersistedVeoExtension({')
    expect(source).toContain('const retry = await startVeo(state.model, retryInput, apiKey)')
    expect(source).toContain('MAX_GENERATION_RETRY_ATTEMPTS = 2')
    expect(source).toContain('generationRetryClaimToken')
    expect(source).not.toContain('Video provider is at capacity. Please try again in a moment.')
  })

  it('bounds video analysis before buffering and sanitizes upstream log bodies', () => {
    const analyze = read('supabase/functions/video-analyze/index.ts')
    const copyright = read('supabase/functions/copyright-check/index.ts')
    expect(analyze).toContain('readResponseBytesWithLimit(videoResp, MAX_BYTES)')
    expect(analyze).not.toContain('videoResp.arrayBuffer()')
    expect(analyze).toContain('sanitizeUpstreamErrorBody(t)')
    expect(copyright).toContain('sanitizeUpstreamErrorBody(t)')
    expect(copyright).toContain('sanitizeUpstreamErrorBody(upstreamBody)')
  })

  it('removes Supabase JWT query transport from every video-proxy path', () => {
    const edge = read('supabase/functions/video-proxy/index.ts')
    const client = read('src/modules/generator-ui/lib/proxiedVideoUrl.ts')
    expect(edge).toContain('signVideoProxyTarget')
    expect(edge).toContain('verifyVideoProxyToken')
    expect(edge).toContain('proxy_token')
    expect(edge).not.toContain('searchParams.get("token")')
    expect(client).toContain('Authorization: `Bearer ${token}`')
    expect(client).toContain('method: "POST"')
    expect(client).not.toContain('new URLSearchParams({ url, token })')
  })
})
