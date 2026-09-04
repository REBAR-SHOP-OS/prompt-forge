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
})
