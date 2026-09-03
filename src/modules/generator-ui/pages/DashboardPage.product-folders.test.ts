import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Storage Product Photos folders', () => {
  it('renders canonical product groups as folders containing their angle cards', () => {
    const source = readFileSync('src/modules/generator-ui/pages/DashboardPage.tsx', 'utf8')

    expect(source).toContain('groupProductPhotos(archiveProductImages)')
    expect(source).toContain('archiveProductGroups.map((group) =>')
    expect(source).toContain('<FolderOpen')
    expect(source).toContain('{group.name}')
    expect(source).toContain('group.photos.map((img) =>')
    expect(source).toContain("Angles are grouped into one folder and rotated across film scenes.")
  })
})
