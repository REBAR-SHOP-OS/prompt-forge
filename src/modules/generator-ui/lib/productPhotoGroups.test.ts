import { describe, expect, it } from 'vitest'
import { groupProductPhotos, productPhotoForScene } from './productPhotoGroups'

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
