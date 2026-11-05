import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiImageDialog from './AiImageDialog'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() }, functions: { invoke } },
}))

const readers: ControlledFileReader[] = []
class ControlledFileReader {
  result: string | ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL() { readers.push(this) }
  succeed() { this.result = 'data:image/png;base64,aW1hZ2U='; this.onload?.() }
  fail() { this.onerror?.() }
}
const file = (name: string) => new File(['image'], name, { type: 'image/png' })
const props = { open: true, onOpenChange: vi.fn(), userId: 'user-1', defaultAspect: '1:1' as const, onSaved: vi.fn() }
const input = (refine = false) => screen.getByLabelText(refine ? 'Add refinement reference images' : 'Upload reference images') as HTMLInputElement
const choose = (files: File[], refine = false) => fireEvent.change(input(refine), { target: { files } })
async function finish(...pending: ControlledFileReader[]) {
  await act(async () => { pending.forEach(reader => reader.succeed()); await Promise.resolve() })
}

beforeEach(() => {
  readers.length = 0
  invoke.mockReset()
  vi.stubGlobal('FileReader', ControlledFileReader)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe.each([false, true])('AI image reference upload (refine=%s)', refine => {
  const viewProps = () => ({ ...props, initialImageUrl: refine ? 'https://example.test/image.png' : null })
  it('exposes a named, focusable native picker at the upload control', () => {
    render(<AiImageDialog {...viewProps()} />)
    expect(input(refine)).toHaveAttribute('type', 'file')
    expect(input(refine)).toHaveAttribute('accept', 'image/*')
    expect(input(refine)).toHaveAttribute('multiple')
    expect(input(refine)).not.toHaveClass('hidden')
    expect(input(refine).closest('label')).not.toBeNull()
    input(refine).focus()
    expect(document.activeElement).toBe(input(refine))
  })
  it('reads and previews a file without starting generation, and allows reselection', async () => {
    render(<AiImageDialog {...viewProps()} />)
    const sameFile = file('cage.png')
    choose([sameFile], refine)
    expect(input(refine)).toBeDisabled()
    expect(input(refine).value).toBe('')
    await finish(readers[0])
    expect(screen.getByAltText(refine ? 'Reference' : 'Reference preview')).toHaveAttribute('src', 'data:image/png;base64,aW1hZ2U=')
    expect(invoke).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference image' }))
    choose([sameFile], refine)
    expect(readers).toHaveLength(2)
    await finish(readers[1])
    expect(input(refine)).not.toBeDisabled()
  })
  it('serializes overlapping file selections and enforces the four-reference cap', async () => {
    render(<AiImageDialog {...viewProps()} />)
    choose([file('1.png'), file('2.png'), file('3.png')], refine)
    choose([file('4.png'), file('5.png'), file('6.png')], refine)
    expect(readers).toHaveLength(3)
    await finish(...readers)
    choose([file('4.png'), file('5.png')], refine)
    expect(readers).toHaveLength(4)
    await finish(readers[3])
    expect(screen.getAllByAltText(refine ? 'Reference' : 'Reference preview')).toHaveLength(4)
    expect(input(refine)).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Extra files were ignored')
  })
  it('discards old reads across close/reopen without unlocking a newer read', async () => {
    const view = render(<AiImageDialog {...viewProps()} />)
    choose([file('old.png')], refine)
    const stale = readers[0]
    view.rerender(<AiImageDialog {...viewProps()} open={false} />)
    view.rerender(<AiImageDialog {...viewProps()} />)
    choose([file('new.png')], refine)
    await finish(stale)
    expect(screen.queryByAltText(refine ? 'Reference' : 'Reference preview')).not.toBeInTheDocument()
    expect(input(refine)).toBeDisabled()
    await finish(readers[1])
    expect(screen.getAllByAltText(refine ? 'Reference' : 'Reference preview')).toHaveLength(1)
    expect(input(refine)).not.toBeDisabled()
  })
  it('discards a read when the account changes', async () => {
    const view = render(<AiImageDialog {...viewProps()} />)
    choose([file('old-account.png')], refine)
    view.rerender(<AiImageDialog {...viewProps()} userId="user-2" />)
    await finish(readers[0])
    expect(screen.queryByAltText(refine ? 'Reference' : 'Reference preview')).not.toBeInTheDocument()
    expect(input(refine)).not.toBeDisabled()
  })
  it('discards a pending read when the editor image is replaced', async () => {
    const view = render(<AiImageDialog {...viewProps()} />)
    choose([file('old-editor.png')], refine)
    view.rerender(<AiImageDialog {...viewProps()} initialImageUrl="https://example.test/replacement.png" />)
    await finish(readers[0])
    expect(screen.getByAltText('Generated')).toHaveAttribute('src', 'https://example.test/replacement.png')
    expect(screen.queryByAltText('Reference')).not.toBeInTheDocument()
    expect(input(true)).not.toBeDisabled()
  })
  it('safely ignores read completion after unmount', async () => {
    const view = render(<AiImageDialog {...viewProps()} />)
    choose([file('abandoned.png')], refine)
    view.unmount()
    await finish(readers[0])
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('blocks native-input changes while generation or refinement is running', async () => {
    invoke.mockImplementation(() => new Promise(() => {}))
    render(<AiImageDialog {...viewProps()} />)
    const textarea = screen.getByPlaceholderText(refine ? /make the lighting warmer/i : /dark industrial workshop/i)
    fireEvent.change(textarea, { target: { value: 'Keep the exact cage geometry' } })
    fireEvent.click(screen.getByRole('button', { name: refine ? 'Apply edit' : 'Generate' }))
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(input(refine)).toBeDisabled()
    choose([file('late.png')], refine)
    expect(readers).toHaveLength(0)
  })
  it('shows read failure and permits retry; cancelling selection is a no-op', async () => {
    render(<AiImageDialog {...viewProps()} />)
    choose([], refine)
    expect(readers).toHaveLength(0)
    choose([file('bad.png')], refine)
    await act(async () => { readers[0].fail(); await Promise.resolve() })
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to read image')
    expect(input(refine)).not.toBeDisabled()
    choose([file('good.png')], refine)
    await finish(readers[1])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('does not generate or refine while selected bytes are still being read', async () => {
    render(<AiImageDialog {...viewProps()} />)
    const textarea = screen.getByPlaceholderText(refine ? /make the lighting warmer/i : /dark industrial workshop/i)
    fireEvent.change(textarea, { target: { value: 'Keep the exact cage geometry' } })
    choose([file('cage.png')], refine)
    const action = screen.getByRole('button', { name: refine ? 'Apply edit' : 'Generate' })
    expect(action).toBeDisabled()
    fireEvent.click(action)
    expect(invoke).not.toHaveBeenCalled()
    await finish(readers[0])
    await waitFor(() => expect(action).not.toBeDisabled())
  })
})
