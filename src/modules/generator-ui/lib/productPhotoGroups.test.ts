import { describe, expect, it } from 'vitest'
import {
  groupProductPhotos,
  normalizeProductFolderName,
  productFolderNameKey,
  productPhotoForScene,
  productPhotoStoragePath,
  storedProductFolderId,
} from './productPhotoGroups'

describe('groupProductPhotos', () => {
  it('groups numbered angle files under the canonical product name', () => {
    const groups = groupProductPhotos([
      { id: '8', title: 'Rebar Stirrup 008' },
      { id: '7', title: 'Rebar Stirrup 007' },
      { id: 'mesh', title: 'Wire Mesh 001' },
    ])

    expect(groups).toEqual([
      {
        id: 'rebar stirrup',
        name: 'Rebar Stirrup',
        photos: [
          { id: '8', title: 'Rebar Stirrup 008' },
          { id: '7', title: 'Rebar Stirrup 007' },
        ],
      },
      {
        id: 'wire mesh',
        name: 'Wire Mesh',
        photos: [{ id: 'mesh', title: 'Wire Mesh 001' }],
      },
    ])
  })

  it('preserves meaningful product numbers and keeps untitled uploads separate', () => {
    const groups = groupProductPhotos([
      { id: 'a', title: 'Rebar #4' },
      { id: 'b', title: 'Rebar #4' },
      { id: 'c', title: null },
      { id: 'd', title: null },
    ])

    expect(groups.map((group) => [group.name, group.photos.map((photo) => photo.id)])).toEqual([
      ['Rebar #4', ['a', 'b']],
      ['Selected Product', ['c']],
      ['Selected Product', ['d']],
    ])
  })

  it('uses the explicit storage folder as product identity even when angle titles differ', () => {
    const groups = groupProductPhotos([
      { id: 'front', title: 'Front detail', storagePath: 'user-1/products/folder-7/front.png' },
      { id: 'back', title: 'Back detail', storage_path: 'user-1/products/folder-7/back.png' },
      { id: 'other', title: 'Front detail', storagePath: 'user-1/products/folder-8/front.png' },
    ])

    expect(groups.map((group) => [group.id, group.photos.map((photo) => photo.id)])).toEqual([
      ['folder:folder-7', ['front', 'back']],
      ['folder:folder-8', ['other']],
    ])
  })
})

describe('explicit product folder metadata', () => {
  it('normalizes a user-created name and builds a durable virtual-folder upload path', () => {
    expect(normalizeProductFolderName('  Rebar   Stirrup  ')).toBe('Rebar Stirrup')
    expect(productFolderNameKey(' Rebar   Stirrup ')).toBe('rebar stirrup')
    expect(productPhotoStoragePath('user-1', 'folder-7', 'image-2', 'ANGLE.JP$G')).toBe(
      'user-1/products/folder-7/image-2.jpg',
    )
    expect(storedProductFolderId({
      id: 'photo',
      storagePath: 'https://example.test/storage/v1/object/sign/user-images/user-1/products/folder-7/image.png?token=x',
    })).toBe('folder-7')
  })
})

describe('productPhotoForScene', () => {
  it('cycles through every stored angle and remains stable per scene', () => {
    const photos = ['front', 'side', 'back']
    expect([0, 1, 2, 3, 4].map((scene) => productPhotoForScene(photos, scene))).toEqual([
      'front',
      'side',
      'back',
      'front',
      'side',
    ])
    expect(productPhotoForScene(photos, 2)).toBe('back')
  })
})
