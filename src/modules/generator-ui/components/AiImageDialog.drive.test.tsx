import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiImageDialog from './AiImageDialog'

const H = vi.hoisted(() => ({ config: vi.fn(), prepare: vi.fn(), choose: vi.fn(), invoke: vi.fn(), storage: vi.fn(), from: vi.fn() }))
vi.mock('@/modules/generator-ui/lib/googleDriveReference', () => ({ getDrivePickerConfig: H.config, prepareDrivePicker: H.prepare, chooseDriveImages: H.choose }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: H.invoke }, storage: { from: H.storage }, from: H.from } }))
const props = { open: true, onOpenChange: vi.fn(), userId: 'user-1', defaultAspect: '1:1' as const, onSaved: vi.fn() }
const config = { clientId: 'test.apps.googleusercontent.com', apiKey: 'test-key', appId: '123', folderId: 'approved-folder' }
const image = { name: 'cage.png', dataUrl: 'data:image/png;base64,dGVzdA==' }
const button = () => screen.getByRole('button', { name: 'Choose from Drive' })
async function prepare() {
  fireEvent.click(button())
  await waitFor(() => expect(button()).not.toBeDisabled())
  expect(H.prepare).toHaveBeenCalledOnce()
}
beforeEach(() => {
  Object.values(H).forEach(mock => mock.mockReset())
  H.config.mockReturnValue(config)
  H.prepare.mockResolvedValue(undefined)
  H.choose.mockResolvedValue([image])
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { vi.restoreAllMocks() })

describe.each([false, true])('Drive image references (refine=%s)', refine => {
  const viewProps = () => ({ ...props, initialImageUrl: refine ? 'https://example.test/original.png' : null })
  const alt = () => refine ? 'Reference' : 'Reference preview'
  it('is visibly disabled without app configuration and makes no Google calls', () => {
    H.config.mockReturnValue(null)
    render(<AiImageDialog {...viewProps()} />)
    expect(button()).toBeDisabled()
    expect(screen.getByText('Drive setup required')).toBeVisible()
    fireEvent.click(button())
    expect(H.prepare).not.toHaveBeenCalled()
    expect(H.choose).not.toHaveBeenCalled()
  })
  it('separates SDK loading from a fresh OAuth click and previews without upload or generation', async () => {
    render(<AiImageDialog {...viewProps()} />)
    await prepare()
    expect(H.choose).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Choose from Drive again')
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByAltText(alt())).toHaveAttribute('src', image.dataUrl))
    expect(H.choose).toHaveBeenCalledWith(config, 4, expect.any(AbortSignal))
    expect(H.invoke).not.toHaveBeenCalled()
    expect(H.storage).not.toHaveBeenCalled()
    expect(H.from).not.toHaveBeenCalled()
  })
  it('shares the read lock with native upload, generation and image saving', async () => {
    H.choose.mockImplementation(() => new Promise(() => {}))
    render(<AiImageDialog {...viewProps()} />)
    await prepare()
    fireEvent.change(screen.getByPlaceholderText(refine ? /make the lighting warmer/i : /dark industrial workshop/i), { target: { value: 'Keep the cage geometry' } })
    fireEvent.click(button())
    expect(button()).toBeDisabled()
    expect(screen.getByLabelText(refine ? 'Add refinement reference images' : 'Upload reference images')).toBeDisabled()
    expect(screen.getByRole('button', { name: refine ? 'Apply edit' : 'Generate' })).toBeDisabled()
    if (refine) {
      expect(screen.getByRole('button', { name: 'Use this image' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Use this image' }))
    }
    fireEvent.click(button())
    expect(H.choose).toHaveBeenCalledOnce()
    expect(H.invoke).not.toHaveBeenCalled()
    expect(H.storage).not.toHaveBeenCalled()
  })
  it('ignores old selections after closing and reopening', async () => {
    let complete!: (images: typeof image[]) => void
    H.choose.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const view = render(<AiImageDialog {...viewProps()} />)
    await prepare(); fireEvent.click(button())
    const oldSignal = H.choose.mock.calls[0][2] as AbortSignal
    view.rerender(<AiImageDialog {...viewProps()} open={false} />)
    view.rerender(<AiImageDialog {...viewProps()} />)
    expect(oldSignal.aborted).toBe(true)
    await act(async () => complete([image]))
    expect(screen.queryByAltText(alt())).not.toBeInTheDocument()
    expect(button()).not.toBeDisabled()
  })
  it('aborts and ignores a selection after an account change', async () => {
    let complete!: (images: typeof image[]) => void
    H.choose.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const view = render(<AiImageDialog {...viewProps()} />)
    await prepare(); fireEvent.click(button())
    const oldSignal = H.choose.mock.calls[0][2] as AbortSignal
    view.rerender(<AiImageDialog {...viewProps()} userId="user-2" />)
    expect(oldSignal.aborted).toBe(true)
    await act(async () => complete([image]))
    expect(screen.queryByAltText(alt())).not.toBeInTheDocument()
  })
  it('treats picker cancel as a no-op and permits retry', async () => {
    H.choose.mockResolvedValueOnce([]).mockResolvedValueOnce([image])
    render(<AiImageDialog {...viewProps()} />)
    await prepare(); fireEvent.click(button())
    await waitFor(() => expect(button()).not.toBeDisabled())
    expect(screen.queryByAltText(alt())).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByAltText(alt())).toBeInTheDocument())
  })
  it('shows a safe connection error and permits retry', async () => {
    H.choose.mockRejectedValueOnce(new Error('Google access expired. Choose again.'))
    render(<AiImageDialog {...viewProps()} />)
    await prepare(); fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Google access expired'))
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByAltText(alt())).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('passes only remaining capacity and caps added references', async () => {
    H.choose.mockResolvedValueOnce([image, image, image]).mockResolvedValueOnce([image, image])
    render(<AiImageDialog {...viewProps()} />)
    await prepare(); fireEvent.click(button())
    await waitFor(() => expect(screen.getAllByAltText(alt())).toHaveLength(3))
    fireEvent.click(button())
    await waitFor(() => expect(screen.getAllByAltText(alt())).toHaveLength(4))
    expect(H.choose.mock.calls[1][1]).toBe(1)
    expect(button()).toBeDisabled()
  })
  it('can explicitly cancel a pending selection and ignores its later result', async () => {
    let complete!: (images: typeof image[]) => void
    H.choose.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    render(<AiImageDialog {...viewProps()} />)
    await prepare(); fireEvent.click(button())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Drive selection' }))
    expect((H.choose.mock.calls[0][2] as AbortSignal).aborted).toBe(true)
    await act(async () => complete([image]))
    expect(screen.queryByAltText(alt())).not.toBeInTheDocument()
    expect(button()).not.toBeDisabled()
  })
  it('retries SDK loading without initiating OAuth after a load failure', async () => {
    H.prepare.mockRejectedValueOnce(new Error('Google picker could not load.'))
    render(<AiImageDialog {...viewProps()} />)
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not load'))
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Choose from Drive again'))
    expect(H.prepare).toHaveBeenCalledTimes(2)
    expect(H.choose).not.toHaveBeenCalled()
  })
})
