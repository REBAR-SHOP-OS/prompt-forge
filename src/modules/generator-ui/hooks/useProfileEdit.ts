// Profile edit hook for Account Center.
// Handles avatar upload/replace/remove and first/last name updates.
// Writes to core_user_profiles (RLS-scoped, user owns their row) and
// Supabase auth user_metadata for display name. Does NOT touch credits,
// billing, or any usage-related data.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/core/auth/AuthProvider'
import { supabase } from '@/integrations/supabase/client'

const AVATARS_BUCKET = 'avatars'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface ProfileEditState {
  firstName: string
  lastName: string
  avatarUrl: string | null
}

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function useProfileEdit() {
  const { user, profile, refreshProfile } = useAuth()

  // Seed form fields from DB profile or auth metadata fallback
  const dbFirstName = (profile as Record<string, unknown> | null)?.first_name as string | undefined
  const dbLastName = (profile as Record<string, unknown> | null)?.last_name as string | undefined
  const dbAvatarUrl = (profile as Record<string, unknown> | null)?.avatar_url as string | undefined

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const metaFullName = (meta.full_name as string) ?? (meta.name as string) ?? ''
  const metaParts = metaFullName.trim().split(/\s+/)
  const metaFirst = metaParts[0] ?? ''
  const metaLast = metaParts.slice(1).join(' ') ?? ''

  const [firstName, setFirstName] = useState(dbFirstName ?? metaFirst ?? '')
  const [lastName, setLastName] = useState(dbLastName ?? metaLast ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(dbAvatarUrl ?? null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Re-sync when profile data loads/changes
  useEffect(() => {
    if (dbFirstName !== undefined) setFirstName(dbFirstName)
    else if (metaFirst) setFirstName(metaFirst)
    if (dbLastName !== undefined) setLastName(dbLastName)
    else if (metaLast) setLastName(metaLast)
    setAvatarUrl(dbAvatarUrl ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, dbAvatarUrl])

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!user?.id) return null
    if (!ALLOWED_TYPES.includes(file.type)) {
      setSaveError('Only JPEG, PNG, or WebP images are allowed.')
      return null
    }
    if (file.size > MAX_FILE_SIZE) {
      setSaveError('Image must be under 5 MB.')
      return null
    }

    setUploading(true)
    setSaveError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `${user.id}/avatar-${Date.now()}.${ext}`

      // Remove old avatar if it exists
      if (avatarUrl) {
        const oldPath = avatarUrl.split('/avatars/')[1]
        if (oldPath) {
          await supabase.storage.from(AVATARS_BUCKET).remove([oldPath]).catch(() => {})
        }
      }

      const { error: upErr } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })

      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path)
      const publicUrl = pub.publicUrl

      // Persist avatar_url to profile row
      const { error: dbErr } = await supabase
        .from('core_user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (dbErr) throw dbErr

      // Update auth user_metadata for display
      await supabase.auth.updateUser({
        data: { ...meta, avatar_url: publicUrl },
      })

      setAvatarUrl(publicUrl)
      void refreshProfile()
      return publicUrl
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload image.'
      setSaveError(msg)
      return null
    } finally {
      setUploading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, avatarUrl, meta])

  const removeAvatar = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false
    setUploading(true)
    setSaveError(null)
    try {
      if (avatarUrl) {
        const oldPath = avatarUrl.split('/avatars/')[1]
        if (oldPath) {
          await supabase.storage.from(AVATARS_BUCKET).remove([oldPath]).catch(() => {})
        }
      }

      const { error: dbErr } = await supabase
        .from('core_user_profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)

      if (dbErr) throw dbErr

      await supabase.auth.updateUser({
        data: { ...meta, avatar_url: null },
      })

      setAvatarUrl(null)
      void refreshProfile()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove image.'
      setSaveError(msg)
      return false
    } finally {
      setUploading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, avatarUrl, meta])

  const saveProfile = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

      // 1) Update core_user_profiles
      const { error: dbErr } = await supabase
        .from('core_user_profiles')
        .update({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        })
        .eq('id', user.id)

      if (dbErr) throw dbErr

      // 2) Update auth user_metadata for display name
      await supabase.auth.updateUser({
        data: { ...meta, full_name: fullName, name: fullName },
      })

      setSaveStatus('success')
      void refreshProfile()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile.'
      setSaveError(msg)
      setSaveStatus('error')
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, firstName, lastName, meta])

  const resetStatus = useCallback(() => {
    setSaveStatus('idle')
    setSaveError(null)
  }, [])

  return {
    firstName, setFirstName,
    lastName, setLastName,
    avatarUrl,
    saveStatus, saveError,
    uploading,
    uploadAvatar,
    removeAvatar,
    saveProfile,
    resetStatus,
  }
}