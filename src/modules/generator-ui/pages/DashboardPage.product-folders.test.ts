import { describe, expect, it } from 'vitest'
// ?raw is resolved by Vite at transform time, so the source is located the same
// way the app locates it. Reading the TSX with node:fs and a relative path made
// the assertion depend on the process cwd instead.
import source from './DashboardPage.tsx?raw'

describe('Storage Product Photos folders', () => {
  it('renders canonical product groups as folders containing their angle cards', () => {
    expect(source).toContain('groupProductPhotos(archiveProductImages)')
    expect(source).toContain('archiveProductGroups.map((group) =>')
    expect(source).toContain('<FolderOpen')
    expect(source).toContain('{group.name}')
    expect(source).toContain('group.photos.map((img) =>')
    expect(source).toContain("Angles are grouped into one folder and rotated across film scenes.")
  })
})
