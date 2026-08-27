import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// ─── All mock refs hoisted (vi.mock runs before const declarations) ────

const M = vi.hoisted(() => {
  const uploadFn = vi.fn()
  const removeFn = vi.fn()
  const getPublicUrlFn = vi.fn()
  const updateFn = vi.fn()
  const eqFn = vi.fn()
  const authUpdateUser = vi.fn()
  const refreshProfile = vi.fn()

  const state = {
    user: {
      id: 'user-1',
      email: 'radin@example.com',
      user_metadata: { full_name: 'Radin Rebar', name: 'Radin Rebar' } as Record<string, unknown>,
    },
    profile: {
      id: 'user-1',
      email: 'radin@example.com',
      role: 'user' as const,
      credits_balance: 500,
      created_at: '',
      first_name: null as string | null,
      last_name: null as string | null,
      avatar_url: null as string | null,
    },
    storageUploadResult: { data: { path: 'user-1/avatar-123.png' }, error: null } as { data: unknown; error: unknown },
    storageRemoveResult: { data: null, error: null } as { data: unknown; error: unknown },
    storagePublicUrl: 'https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/avatar-123.png',
    dbUpdateResult: { data: null, error: null } as { data: unknown; error: unknown },
  }

  return { state, uploadFn, removeFn, getPublicUrlFn, updateFn, eqFn, authUpdateUser, refreshProfile }
})

vi.mock('@/core/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: M.state.user,
    profile: M.state.profile,
    refreshProfile: M.refreshProfile,
  }),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ update: M.updateFn, eq: M.eqFn }),
    storage: {
      from: () => ({
        upload: M.uploadFn,
        remove: M.removeFn,
        getPublicUrl: M.getPublicUrlFn,
      }),
    },
    auth: {
      updateUser: M.authUpdateUser,
    },
  },
}))

import { useProfileEdit } from './useProfileEdit'

function renderEditHook() {
  return renderHook(() => useProfileEdit())
}

const OLD_AVATAR = 'https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/old.png'
const NEW_AVATAR = 'https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/new.png'

beforeEach(() => {
  vi.clearAllMocks()

  M.uploadFn.mockImplementation(async () => M.state.storageUploadResult)
  M.removeFn.mockImplementation(async () => M.state.storageRemoveResult)
  M.getPublicUrlFn.mockImplementation(() => ({ data: { publicUrl: M.state.storagePublicUrl } }))
  M.updateFn.mockImplementation(() => ({ eq: M.eqFn }))
  M.eqFn.mockImplementation(async () => M.state.dbUpdateResult)

  M.state.profile.first_name = null
  M.state.profile.last_name = null
  M.state.profile.avatar_url = null
  M.state.user.user_metadata = { full_name: 'Radin Rebar', name: 'Radin Rebar' }
  M.refreshProfile.mockResolvedValue(undefined)
  M.authUpdateUser.mockResolvedValue({ data: { user: M.state.user }, error: null })
  M.state.storageUploadResult = { data: { path: 'user-1/avatar-123.png' }, error: null }
  M.state.storageRemoveResult = { data: null, error: null }
  M.state.storagePublicUrl = 'https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/avatar-123.png'
  M.state.dbUpdateResult = { data: null, error: null }
})

describe('useProfileEdit', () => {
  describe('initial state', () => {
    it('seeds first/last name from profile when DB has values', () => {
      M.state.profile.first_name = 'Radin'
      M.state.profile.last_name = 'Rebar'
      const { result } = renderEditHook()
      expect(result.current.firstName).toBe('Radin')
      expect(result.current.lastName).toBe('Rebar')
    })

    it('falls back to auth metadata full_name when DB is null', () => {
      const { result } = renderEditHook()
      expect(result.current.firstName).toBe('Radin')
      expect(result.current.lastName).toBe('Rebar')
    })

    it('has null avatarUrl when no avatar in DB or metadata', () => {
      const { result } = renderEditHook()
      expect(result.current.avatarUrl).toBeNull()
    })

    it('shows avatarUrl from DB profile', () => {
      M.state.profile.avatar_url = OLD_AVATAR
      const { result } = renderEditHook()
      expect(result.current.avatarUrl).toBe(OLD_AVATAR)
    })

    it('starts in idle save status with no error', () => {
      const { result } = renderEditHook()
      expect(result.current.saveStatus).toBe('idle')
      expect(result.current.saveError).toBeNull()
    })
  })

  describe('uploadAvatar - validation', () => {
    it('rejects invalid MIME type', async () => {
      const { result } = renderEditHook()
      const file = new File(['data'], 'test.gif', { type: 'image/gif' })
      const url = await act(async () => result.current.uploadAvatar(file))
      expect(url).toBeNull()
      expect(result.current.saveError).toMatch(/JPEG.*PNG.*WebP/)
    })

    it('rejects oversize file (>5MB)', async () => {
      const { result } = renderEditHook()
      const file = new File(['x'], 'big.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 })
      const url = await act(async () => result.current.uploadAvatar(file))
      expect(url).toBeNull()
      expect(result.current.saveError).toMatch(/5 MB/i)
    })
  })

  describe('uploadAvatar - success', () => {
    it('uploads, persists to DB, updates auth, and returns public URL', async () => {
      const { result } = renderEditHook()
      const file = new File(['img'], 'avatar.png', { type: 'image/png' })

      const url = await act(async () => result.current.uploadAvatar(file))

      expect(M.uploadFn).toHaveBeenCalledOnce()
      expect(M.getPublicUrlFn).toHaveBeenCalledOnce()
      expect(M.updateFn).toHaveBeenCalledWith({ avatar_url: url })
      expect(M.authUpdateUser).toHaveBeenCalledOnce()
      expect(result.current.avatarUrl).toBe(M.state.storagePublicUrl)
      expect(result.current.uploading).toBe(false)
      expect(M.refreshProfile).toHaveBeenCalledOnce()
    })
  })

  describe('uploadAvatar - replace (safe: new before delete old)', () => {
    it('preserves old avatar if upload fails', async () => {
      M.state.profile.avatar_url = OLD_AVATAR
      M.state.storageUploadResult = { data: null, error: { message: 'Upload failed' } }
      const { result } = renderEditHook()

      const file = new File(['img'], 'new.png', { type: 'image/png' })
      const url = await act(async () => result.current.uploadAvatar(file))

      expect(url).toBeNull()
      expect(result.current.avatarUrl).toBe(OLD_AVATAR)
      expect(M.removeFn).not.toHaveBeenCalled()
      expect(result.current.saveError).toBeTruthy()
    })

    it('preserves old avatar and cleans up new file if DB persist fails', async () => {
      M.state.profile.avatar_url = OLD_AVATAR
      M.state.storageUploadResult = { data: { path: 'user-1/new.png' }, error: null }
      M.state.storagePublicUrl = NEW_AVATAR
      M.state.dbUpdateResult = { data: null, error: { message: 'DB error' } }
      const { result } = renderEditHook()

      const file = new File(['img'], 'new.png', { type: 'image/png' })
      const url = await act(async () => result.current.uploadAvatar(file))

      expect(url).toBeNull()
      expect(result.current.avatarUrl).toBe(OLD_AVATAR)
      // New file cleaned up (path is user-1/avatar-<timestamp>.ext)
      expect(M.removeFn).toHaveBeenCalledOnce()
      const removedPath = M.removeFn.mock.calls[0][0][0] as string
      expect(removedPath).toMatch(/^user-1\/avatar-\d+\./)
    })

    it('deletes old file only after new avatar fully persisted', async () => {
      M.state.profile.avatar_url = OLD_AVATAR
      M.state.storagePublicUrl = NEW_AVATAR
      M.state.storageUploadResult = { data: { path: 'user-1/new.png' }, error: null }

      const callOrder: string[] = []
      M.uploadFn.mockImplementation(async () => {
        callOrder.push('upload')
        return M.state.storageUploadResult
      })
      M.eqFn.mockImplementation(async () => {
        callOrder.push('db-update')
        return M.state.dbUpdateResult
      })
      M.removeFn.mockImplementation(async () => {
        callOrder.push('remove-old')
        return M.state.storageRemoveResult
      })

      const { result } = renderEditHook()
      const file = new File(['img'], 'new.png', { type: 'image/png' })
      await act(async () => result.current.uploadAvatar(file))

      expect(callOrder).toEqual(['upload', 'db-update', 'remove-old'])
    })
  })

  describe('uploadAvatar - auth.updateUser failure (non-fatal)', () => {
    it('succeeds even if auth.updateUser fails (display-only metadata)', async () => {
      M.authUpdateUser.mockResolvedValue({ data: null, error: { message: 'Auth error' } })
      const { result } = renderEditHook()

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })
      const url = await act(async () => result.current.uploadAvatar(file))

      expect(url).toBe(M.state.storagePublicUrl)
      expect(result.current.saveError).toBeNull()
    })
  })

  describe('removeAvatar', () => {
    it('sets avatar_url to null in DB, updates auth, and clears state', async () => {
      M.state.profile.avatar_url = OLD_AVATAR
      const { result } = renderEditHook()

      const ok = await act(async () => result.current.removeAvatar())

      expect(ok).toBe(true)
      expect(result.current.avatarUrl).toBeNull()
      expect(M.authUpdateUser).toHaveBeenCalledOnce()
      expect(M.refreshProfile).toHaveBeenCalledOnce()
    })

    it('reports error and returns false if DB update fails', async () => {
      M.state.profile.avatar_url = OLD_AVATAR
      M.state.dbUpdateResult = { data: null, error: { message: 'DB error' } }
      const { result } = renderEditHook()

      const ok = await act(async () => result.current.removeAvatar())

      expect(ok).toBe(false)
      expect(result.current.saveError).toBe('DB error')
      expect(result.current.avatarUrl).toBe(OLD_AVATAR)
    })
  })

  describe('saveProfile', () => {
    it('saves first/last name to DB and updates auth metadata', async () => {
      const { result } = renderEditHook()
      act(() => {
        result.current.setFirstName('NewFirst')
        result.current.setLastName('NewLast')
      })

      const ok = await act(async () => result.current.saveProfile())

      expect(ok).toBe(true)
      expect(result.current.saveStatus).toBe('success')
      expect(M.authUpdateUser).toHaveBeenCalledOnce()
      expect(M.refreshProfile).toHaveBeenCalledOnce()
    })

    it('reports error and sets saveStatus to error if DB fails', async () => {
      M.state.dbUpdateResult = { data: null, error: { message: 'DB write failed' } }
      const { result } = renderEditHook()
      act(() => result.current.setFirstName('NewFirst'))

      const ok = await act(async () => result.current.saveProfile())

      expect(ok).toBe(false)
      expect(result.current.saveStatus).toBe('error')
      expect(result.current.saveError).toBe('DB write failed')
    })

    it('succeeds even if auth.updateUser fails (display-only)', async () => {
      M.authUpdateUser.mockResolvedValue({ data: null, error: { message: 'Auth error' } })
      const { result } = renderEditHook()
      act(() => result.current.setFirstName('NewFirst'))

      const ok = await act(async () => result.current.saveProfile())

      expect(ok).toBe(true)
      expect(result.current.saveStatus).toBe('success')
    })
  })

  describe('resetStatus', () => {
    it('resets save status and error', () => {
      const { result } = renderEditHook()
      act(() => result.current.resetStatus())
      expect(result.current.saveStatus).toBe('idle')
      expect(result.current.saveError).toBeNull()
    })
  })

  describe('refresh — /me picks up saved data', () => {
    it('re-syncs firstName/lastName/avatarUrl when profile changes', () => {
      const { result, rerender } = renderEditHook()

      M.state.profile.first_name = 'Updated'
      M.state.profile.last_name = 'Name'
      M.state.profile.avatar_url = 'https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/fresh.png'

      rerender()

      expect(result.current.firstName).toBe('Updated')
      expect(result.current.lastName).toBe('Name')
      expect(result.current.avatarUrl).toBe('https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/fresh.png')
    })
  })

  describe('user isolation', () => {
    it('uses user.id from auth context for storage paths', async () => {
      const { result } = renderEditHook()
      const file = new File(['img'], 'test.png', { type: 'image/png' })

      await act(async () => result.current.uploadAvatar(file))

      expect(M.uploadFn).toHaveBeenCalledWith(
        expect.stringContaining('user-1/'),
        expect.any(File),
        expect.any(Object),
      )
    })
  })
})