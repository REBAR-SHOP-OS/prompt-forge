import { describe, expect, it, vi } from 'vitest'
import { stageProductAdStartFrame } from './productAdHandoff'

describe('stageProductAdStartFrame', () => {
  it('does nothing when the dialog produced no frame', async () => {
    const stage = vi.fn()
    await expect(stageProductAdStartFrame(undefined, stage)).resolves.toBeUndefined()
    expect(stage).not.toHaveBeenCalled()
  })

  it('resolves when staging succeeds', async () => {
    const stage = vi.fn().mockResolvedValue(true)
    await expect(stageProductAdStartFrame('https://x/frame.png', stage)).resolves.toBeUndefined()
    expect(stage).toHaveBeenCalledWith('https://x/frame.png')
  })

  it('throws a user-facing error when staging fails, so the dialog stays open', async () => {
    const stage = vi.fn().mockResolvedValue(false)
    await expect(stageProductAdStartFrame('https://x/frame.png', stage)).rejects.toThrow(
      /Could not stage the Product Ad start frame/,
    )
  })

  it('propagates unexpected staging rejections', async () => {
    const stage = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(stageProductAdStartFrame('https://x/frame.png', stage)).rejects.toThrow('network down')
  })
})
