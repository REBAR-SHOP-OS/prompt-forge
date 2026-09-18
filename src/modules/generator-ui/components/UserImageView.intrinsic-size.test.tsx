import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserImageView } from './UserImageView'

vi.mock('@/modules/generator-ui/lib/userImageUrl', () => ({
  signUserImageUrl: vi.fn(),
}))

function loadWithSize(image: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height })
  fireEvent.load(image)
}

describe('UserImageView intrinsic size reporting', () => {
  it('reports valid natural dimensions once per source measurement', () => {
    const onIntrinsicSize = vi.fn()
    render(
      <UserImageView
        src="https://example.test/image-a.png"
        alt="Uploaded image"
        onIntrinsicSize={onIntrinsicSize}
      />,
    )

    const image = screen.getByAltText('Uploaded image') as HTMLImageElement
    loadWithSize(image, 1080, 1920)
    loadWithSize(image, 1080, 1920)

    expect(onIntrinsicSize).toHaveBeenCalledTimes(1)
    expect(onIntrinsicSize).toHaveBeenCalledWith({ width: 1080, height: 1920 })
  })

  it('allows one fresh report after the source changes', () => {
    const onIntrinsicSize = vi.fn()
    const view = render(
      <UserImageView src="https://example.test/a.png" alt="Uploaded image" onIntrinsicSize={onIntrinsicSize} />,
    )
    loadWithSize(screen.getByAltText('Uploaded image') as HTMLImageElement, 1024, 1024)

    view.rerender(
      <UserImageView src="https://example.test/b.png" alt="Uploaded image" onIntrinsicSize={onIntrinsicSize} />,
    )
    loadWithSize(screen.getByAltText('Uploaded image') as HTMLImageElement, 1920, 1080)

    expect(onIntrinsicSize).toHaveBeenNthCalledWith(1, { width: 1024, height: 1024 })
    expect(onIntrinsicSize).toHaveBeenNthCalledWith(2, { width: 1920, height: 1080 })
  })

  it('ignores invalid browser measurements', () => {
    const onIntrinsicSize = vi.fn()
    render(
      <UserImageView src="https://example.test/image.png" alt="Uploaded image" onIntrinsicSize={onIntrinsicSize} />,
    )
    loadWithSize(screen.getByAltText('Uploaded image') as HTMLImageElement, 0, 0)
    expect(onIntrinsicSize).not.toHaveBeenCalled()
  })
})
