import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserImageView } from './UserImageView'

const signUserImageUrl = vi.hoisted(() => vi.fn())

vi.mock('@/modules/generator-ui/lib/userImageUrl', () => ({ signUserImageUrl }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('UserImageView signed URL lifecycle', () => {
  beforeEach(() => signUserImageUrl.mockReset())

  it('ignores a stale signing response after src changes and accepts the current response', async () => {
    const oldRequest = deferred<string>()
    const currentRequest = deferred<string>()
    signUserImageUrl
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise)

    const { rerender } = render(<UserImageView src="old/path.png" alt="Product" />)
    fireEvent.error(screen.getByRole('img', { name: 'Product' }))
    expect(signUserImageUrl).toHaveBeenCalledWith('old/path.png')

    rerender(<UserImageView src="new/path.png" alt="Product" />)
    expect(screen.getByRole('img', { name: 'Product' })).toHaveAttribute('src', 'new/path.png')

    await act(async () => { oldRequest.resolve('https://signed.example/old.png') })
    expect(screen.getByRole('img', { name: 'Product' })).toHaveAttribute('src', 'new/path.png')

    fireEvent.error(screen.getByRole('img', { name: 'Product' }))
    await act(async () => { currentRequest.resolve('https://signed.example/new.png') })
    expect(screen.getByRole('img', { name: 'Product' })).toHaveAttribute('src', 'https://signed.example/new.png')
  })

  it('does not update state after the component unmounts while signing is pending', async () => {
    const request = deferred<string>()
    signUserImageUrl.mockReturnValueOnce(request.promise)
    const { unmount } = render(<UserImageView src="pending/path.png" alt="Pending" />)
    fireEvent.error(screen.getByRole('img', { name: 'Pending' }))

    unmount()
    await act(async () => { request.resolve('https://signed.example/pending.png') })

    expect(screen.queryByRole('img', { name: 'Pending' })).not.toBeInTheDocument()
  })
})
