import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('high edge security hardening', () => {
  it('makes user-images private with owner-only authenticated reads and an explicit rollback', () => {
    const sql = read('supabase/migrations/20260916120000_high_edge_hardening.sql')
    expect(sql).toContain('SET public = false')
    expect(sql).toContain('DROP POLICY IF EXISTS "user-images: public read"')
    expect(sql).toContain('CREATE POLICY "user-images: users read own folder"')
    expect(sql).toContain('(storage.foldername(name))[1] = auth.uid()::text')
    expect(sql).toContain('-- Manual rollback for a coordinated application rollback only:')
    expect(sql).toContain('UPDATE storage.buckets SET public = true')
  })

  it('adds an atomic service-only persistent transcript quota', () => {
    const sql = read('supabase/migrations/20260916120000_high_edge_hardening.sql')
    expect(sql).toContain('generator_video_transcript_daily_usage')
    expect(sql).toContain('ON CONFLICT (user_id, usage_date) DO UPDATE')
    expect(sql).toContain('request_count < _daily_limit')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_video_transcript_quota(uuid, integer) FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_video_transcript_quota(uuid, integer) TO service_role')
  })

  it('persists canonical private paths and never new user-images public URLs', () => {
    const files = [
      'src/modules/generator-ui/components/AiImageDialog.tsx',
      'src/modules/generator-ui/components/CharacterSheetDialog.tsx',
      'src/modules/generator-ui/pages/DashboardPage.tsx',
      'supabase/functions/generate-character-sheet/index.ts',
    ]
    for (const file of files) {
      const source = read(file)
      expect(source).not.toMatch(/from\(USER_IMAGES_BUCKET\)\.getPublicUrl/)
      expect(source).toContain('storage_path: path')
    }
  })

  it('checks affected Edge Functions with Deno in CI', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain('denoland/setup-deno@v2')
    for (const name of ['copyright-check', 'image-reframe', 'video-analyze', 'video-transcript']) {
      expect(ci).toContain(`supabase/functions/${name}/index.ts`)
    }
    expect(ci).toContain('gemini-policy.deno.ts')
    expect(ci).toContain('safe-media-fetch.deno.ts')
  })

  it('guards service-role ownership before sensitive reads and writes', () => {
    const copyright = read('supabase/functions/copyright-check/index.ts')
    expect(copyright.indexOf('ownsGenerationJob(')).toBeLessThan(copyright.indexOf('generator_copyright_reviews?on_conflict=job_id'))
    const reframe = read('supabase/functions/image-reframe/index.ts')
    expect(reframe).toContain('parseOwnedStorageRef(imageUrl, storageOrigin, auth.userId')
    expect(reframe).not.toContain('const srcResp = await fetch(imageUrl)')
  })
})
