import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CharacterSheetDialog from './CharacterSheetDialog'
import { resolveObjectKey, signUrl } from '@/modules/generator-ui/lib/characterSheetUrl'

const { mockFrom, mockStorage } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockStorage = {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/1.png' }, error: null })),
    })),
  }
  return { mockFrom, mockStorage }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
    functions: { invoke: vi.fn() },
  },
}))

const ROWS = [
  { id: 'c1', storage_path: 'user-1/uuid1.png', title: 'Alpha', created_at: '2026-01-01' },
  { id: 'c2', storage_path: 'https://x.supabase.co/storage/v1/object/public/user-images/user-1/uuid2.png', title: 'Beta', created_at: '2026-01-02' },
  { id: 'c3', storage_path: 'https://x.supabase.co/storage/v1/object/sign/user-images/user-1/uuid3.png?token=expired', title: 'Gamma', created_at: '2026-01-03' },
]

function mockRows(rows: typeof ROWS = ROWS) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'generator_user_images') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                order: vi.fn(async () => ({ data: rows, error: null })),
              })),
            })),
          })),
        })),
      }
    }
    return { select: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })) })) })) }
  })
}

function renderDialog() {
  return render(
    <CharacterSheetDialog
      open
      onOpenChange={vi.fn()}
      userId="user-1"
      onUseCharacter={vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockStorage.from.mockImplementation(() => ({
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/1.png' }, error: null })),
  }))
  mockRows()
})

describe('resolveObjectKey', () => {
  it('returns the raw key unchanged', () => {
    expect(resolveObjectKey('user-1/uuid.png')).toBe('user-1/uuid.png')
  })

  it('extracts the key from a public URL and drops query/hash', () => {
    expect(
      resolveObjectKey('https://x.supabase.co/storage/v1/object/public/user-images/user-1/uuid.png?x=1#frag'),
    ).toBe('user-1/uuid.png')
  })

  it('extracts the key from a signed URL and drops the token', () => {
    expect(
      resolveObjectKey('https://x.supabase.co/storage/v1/object/sign/user-images/user-1/uuid.png?token=abc'),
    ).toBe('user-1/uuid.png')
  })

  it('decodes percent-encoded path segments', () => {
    expect(
      resolveObjectKey('https://x.supabase.co/storage/v1/object/public/user-images/user%201/uuid%20x.png'),
    ).toBe('user 1/uuid x.png')
  })

  it('returns null for blob/data URLs', () => {
    expect(resolveObjectKey('blob:http://x/1')).toBeNull()
    expect(resolveObjectKey('data:image/png;base64,AAAA')).toBeNull()
  })

  it('rejects a foreign host even with a user-images path', () => {
    expect(
      resolveObjectKey('https://evil.example.com/storage/v1/object/public/user-images/user-1/uuid.png'),
    ).toBeNull()
  })

  it('rejects a supabase host with a non-storage path', () => {
    expect(resolveObjectKey('https://x.supabase.co/other/user-images/user-1/uuid.png')).toBeNull()
  })

  it('returns null for empty values', () => {
    expect(resolveObjectKey('')).toBeNull()
    expect(resolveObjectKey(null)).toBeNull()
    expect(resolveObjectKey(undefined)).toBeNull()
  })
})

describe('signUrl', () => {
  it('returns a fresh signed URL for a raw key', async () => {
    const url = await signUrl('user-1/uuid.png')
    expect(url).toBe('https://signed/1.png')
  })

  it('re-signs an expired signed URL instead of returning it verbatim', async () => {
    const url = await signUrl('https://x.supabase.co/storage/v1/object/sign/user-images/user-1/uuid.png?token=expired')
    expect(url).toBe('https://signed/1.png')
  })

  it('returns null when signing fails', async () => {
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
    }))
    const url = await signUrl('user-1/uuid.png')
    expect(url).toBeNull()
  })

  it('returns null for a private public URL that cannot be resolved', async () => {
    const url = await signUrl('https://evil.example.com/private.png')
    expect(url).toBeNull()
  })
})

describe('CharacterSheetDialog thumbnails', () => {
  it('renders signed URLs, never raw storage paths or expired signed URLs', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getAllByAltText(/Alpha|Beta|Gamma/).length).toBeGreaterThan(0))

    const imgs = screen.getAllByRole('img').filter((i) => /Alpha|Beta|Gamma/.test(i.getAttribute('alt') ?? ''))
    expect(imgs.length).toBe(3)
    for (const img of imgs) {
      const src = img.getAttribute('src') ?? ''
      expect(src).toContain('signed')
      expect(src).not.toContain('user-images')
      expect(src).not.toContain('token=')
    }
  })

  it('shows a readable placeholder when signing fails at load', async () => {
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
    }))
    renderDialog()
    await waitFor(() => expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0))
    // No <img> with a raw/private path is rendered.
    const imgs = screen.queryAllByRole('img').filter((i) => /Alpha|Beta|Gamma/.test(i.getAttribute('alt') ?? ''))
    expect(imgs).toHaveLength(0)
  })

  it('re-signs once on image error and recovers', async () => {
    let signCount = 0
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => {
        signCount++
        return { data: { signedUrl: `https://signed/${signCount}.png` }, error: null }
      }),
    }))
    renderDialog()
    await waitFor(() => expect(screen.getAllByAltText(/Alpha|Beta|Gamma/).length).toBeGreaterThan(0))

    const img = screen.getByAltText('Alpha')
    await waitFor(() => expect(img).toHaveAttribute('src', expect.stringContaining('signed')))

    const before = signCount
    fireEvent.error(img)
    await waitFor(() => expect(signCount).toBe(before + 1))
    const after = screen.getByAltText('Alpha')
    await waitFor(() => expect(after).toHaveAttribute('src', expect.stringContaining('signed')))
  })

  it('stays on placeholder after a second failure (no retry loop)', async () => {
    let signCount = 0
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => {
        signCount++
        return { data: null, error: { message: 'boom' } }
      }),
    }))
    renderDialog()
    await waitFor(() => expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0))

    // Trigger the manual retry path once; it should fail and stay failed.
    const retryButtons = screen.getAllByText('Retry image')
    fireEvent.click(retryButtons[0])
    await waitFor(() => expect(signCount).toBeGreaterThan(0))
    // Still showing placeholder, no broken <img>.
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
    const imgs = screen.queryAllByRole('img').filter((i) => /Alpha|Beta|Gamma/.test(i.getAttribute('alt') ?? ''))
    expect(imgs).toHaveLength(0)
  })
})
