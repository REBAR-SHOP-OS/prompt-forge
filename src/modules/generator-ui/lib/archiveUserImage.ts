// Records an image (uploaded or generated anywhere in the app) into the
// `generator_user_images` table so it shows up in the STORAGE → Images tab.
// Failures are swallowed on purpose: archiving must never break the primary
// flow (video generation, reframe, etc.).
import { supabase } from '@/integrations/supabase/client'

export async function archiveUserImage(params: {
  userId: string | null | undefined
  publicUrl: string | null | undefined
  sizeBytes?: number | null
  mimeType?: string | null
}): Promise<void> {
  const { userId, publicUrl, sizeBytes, mimeType } = params
  if (!userId || !publicUrl) return
  try {
    await supabase.from('generator_user_images').insert({
      user_id: userId,
      storage_path: publicUrl,
      size_bytes: sizeBytes ?? null,
      mime_type: mimeType ?? null,
    })
  } catch {
    /* archiving is best-effort; never throw */
  }
}
