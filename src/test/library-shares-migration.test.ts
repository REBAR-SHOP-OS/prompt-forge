import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('drizzle/migrations/0000_library_shares.sql', 'utf8')
const shareSource = readFileSync('src/modules/generator-ui/pages/DashboardPage.tsx', 'utf8')

describe('library sharing', () => {
  it('only widens SELECT access for shared viewers, never write access', () => {
    const shared = sql.match(/CREATE POLICY "[^"]*shared viewers[^"]*"[^;]*;/g) ?? []
    expect(shared.length).toBe(8)
    for (const p of shared) expect(p).toMatch(/FOR SELECT/)
  })

  it('refuses delete of shared items before touching data', () => {
    expect(shareSource).toContain('const handleDeleteArchiveJob = async (jobId: string) => {\n    if (refuseIfShared(jobId)) return')
    expect(shareSource).toContain('const handleDeleteUserImage = async (imageId: string) => {\n    if (refuseIfShared(imageId)) return')
  })
})
