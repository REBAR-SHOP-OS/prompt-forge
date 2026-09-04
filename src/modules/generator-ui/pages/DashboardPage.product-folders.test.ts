import { describe, expect, it, vi } from 'vitest'
// ?raw is resolved by Vite at transform time, so the source is located the same
// way the app locates it. Reading the TSX with node:fs and a relative path made
// the assertion depend on the process cwd instead.
import source from './DashboardPage.tsx?raw'
import { groupProductPhotos, mergeEmptyProductFolders, productFolderStorageId } from '../lib/productPhotoGroups'

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

  // createProductFolder used to hold the new folder only in draftProductFolder
  // (pure useState) — an empty folder had zero generator_user_images rows, so
  // nothing survived a refresh/reopen. The fix persists a product_folders row
  // at creation time and merges it back in on load.
  it('persists a durable row for a newly created folder and loads it on the products tab', () => {
    expect(source).toContain(".from('product_folders')")
    expect(source).toContain('.insert({ user_id: userId, storage_folder_id: storageFolderId, name })')
    expect(source).toContain("mergeEmptyProductFolders(groupProductPhotos(archiveProductImages), productFolders)")
  })

  it('an empty product folder persists across reload', async () => {
    // Simulate the backing store exactly as DashboardPage's loaders read it:
    // zero generator_user_images rows (no photo was ever uploaded into the
    // folder) but one persisted product_folders row (written by
    // createProductFolder). This is a fresh mount reading from the persisted
    // row, not from any in-memory draftProductFolder state.
    // Two independently-shaped mock query builders (mirroring the real
    // .select().eq()...order() chains loadProductImages/loadProductFolders
    // build), so each stays concretely typed rather than a table-name union.
    const mockFromGeneratorUserImages = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: async () => ({ data: [] as Array<{ id: string; storagePath?: string | null }>, error: null }),
            }),
          }),
        }),
      }),
    }))
    const mockFromProductFolders = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [{ storage_folder_id: 'folder-777', name: 'Rebar Stirrup' }],
            error: null,
          }),
        }),
      }),
    }))

    const imagesRes = await mockFromGeneratorUserImages().select().eq().eq().is().order()
    const foldersRes = await mockFromProductFolders().select().eq().order()

    // Reproduce the exact merge DashboardPage performs on load: photo-derived
    // groups (none — the folder is empty) plus the persisted folder records.
    const photoGroups = groupProductPhotos(imagesRes.data)
    const productFolders = foldersRes.data.map((row) => ({
      storageFolderId: row.storage_folder_id,
      name: row.name,
    }))
    const groups = mergeEmptyProductFolders(photoGroups, productFolders)

    // The folder is still present as its own card, even though it has never
    // held a single photo.
    expect(groups).toEqual([{ id: 'folder:folder-777', name: 'Rebar Stirrup', photos: [] }])

    // And it stays a valid upload target: opening it resolves the real
    // storage-folder id (not null), so a photo uploaded now lands under
    // products/folder-777/... and joins this exact folder, rather than
    // falling back to an un-folder-scoped legacy path.
    expect(productFolderStorageId(groups[0], productFolders)).toBe('folder-777')
  })
})
