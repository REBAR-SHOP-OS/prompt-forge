import { describe, expect, it } from 'vitest'
// ?raw is resolved by Vite at transform time, so the source is located the same
// way the app locates it. Reading the TSX with node:fs and a relative path made
// the assertion depend on the process cwd instead.
import source from './DashboardPage.tsx?raw'

describe('Storage Product Photos folders', () => {
  it('requires creating or opening a product folder before adding angle photos', () => {
    expect(source).toContain('groupProductPhotos(archiveProductImages)')
    expect(source).toContain('New Folder')
    expect(source).toContain('Create Folder')
    expect(source).toContain('createProductFolder')
    expect(source).toContain('openProductFolder(group)')
    expect(source).toContain('All product folders')
    expect(source).toContain('Add product photos')
    expect(source).toContain('productPhotoStoragePath(userId, folder.storageFolderId, objectId, file.name)')
    expect(source).toContain('title: folder.name')
  })

  it('renders folder cards separately from the selected folder angle grid', () => {
    expect(source).toContain('archiveProductGroups.map((group) =>')
    expect(source).toContain('<FolderOpen')
    expect(source).toContain('{group.name}')
    expect(source).toContain('{[activeProductGroup].map((group) =>')
    expect(source).toContain('group.photos.map((img) =>')
    expect(source).toContain('All angles stay one product in Make Full Film.')
  })

  // Bulk selection state is global while the grid is scoped to one folder. Ids
  // ticked in folder A survive a switch to folder B and stay armed for bulk
  // delete, with nothing on screen showing what is selected. Closing a folder
  // already cleared it; entering one has to as well, or Delete removes photos
  // the user cannot see.
  it('clears bulk selection whenever the active folder changes', () => {
    const enterPoints = [
      // createProductFolder — new draft folder becomes active
      /setActiveProductFolder\(folder\)[\s\S]{0,600}?setSelectedArchiveIds\(new Set\(\)\)/,
      // openProductFolder — existing folder becomes active
      /storageFolderId: storedProductFolderId\(group\.photos\[0\]\),\s*\}\)\s*setSelectedArchiveIds\(new Set\(\)\)/,
    ]
    for (const pattern of enterPoints) expect(source).toMatch(pattern)

    // And the close path, which was already correct — pinned so the three stay
    // together rather than drifting apart.
    expect(source).toContain("setActiveProductFolder(null); setSelectedArchiveIds(new Set())")
  })

  // Every angle in a folder is written with `title: folder.name`, so a caption
  // lookup keyed by title collapses the folder to one entry and the
  // first-wins guard silently makes the rest unreachable. Keying off the
  // storage basename does not help either — new uploads are `{uuid}.{ext}`,
  // which no caption file a person would name can match. The folder name is
  // the only name that exists both on disk and on screen, so a caption applies
  // to the whole folder.
  it('attaches an imported caption to every angle in the matched folder', () => {
    expect(source).toContain('const byName = new Map<string, UserImageItem[]>()')
    expect(source).toContain('for (const group of archiveProductGroups)')
    expect(source).toMatch(/const targets = byName\.get\(key\)/)
    expect(source).toMatch(/if \(!targets \|\| targets\.length === 0\)/)
    // The write must cover all of them, not just the first.
    expect(source).toMatch(/\.update\(\{ description: text \}\)\s*\.in\('id', targetIds\)/)
    expect(source).toMatch(/\.eq\('user_id', userId\)/)
    // Local state must follow the same set, or the grid disagrees with the DB.
    expect(source).toContain('idSet.has(i.id) ? { ...i, description: text } : i')
    expect(source).toContain('for (const id of targetIds) next[id] = text')

    // The single-target form is what regressed; it must not come back.
    expect(source).not.toMatch(/const target = byName\.get\(key\)/)
    expect(source).not.toMatch(/\.update\(\{ description: text \}\)\s*\.eq\('id', target\.id\)/)
  })
})
