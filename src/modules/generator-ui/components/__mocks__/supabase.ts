import { vi } from 'vitest'

export const mockFrom = vi.fn()
export const mockStorage = {
  from: vi.fn(() => ({
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/1.png' }, error: null })),
  })),
}
export const mockInvoke = vi.fn()

vi.mock('@/integrations/supabase/client', () => {
  console.log('MOCK FACTORY RUNNING')
  return {
    supabase: {
      from: (...args: unknown[]) => {
        console.log('MOCK from called with:', args)
        return mockFrom(...args)
      },
      storage: mockStorage,
      functions: {
        invoke: (...args: unknown[]) => mockInvoke(...args),
      },
    },
  }
})
