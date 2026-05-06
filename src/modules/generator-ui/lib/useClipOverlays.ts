import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import {
  DEFAULT_IMAGE_OVERLAY,
  DEFAULT_TEXT_OVERLAY,
  type ClipOverlay,
  type OverlayClipKind,
} from '@/modules/generator-ui/lib/overlays'

const OVERLAY_BUCKET = 'overlay-assets'

interface ServerRow {
  id: string
  user_id: string
  clip_kind: string
  clip_id: string
  kind: string
  x: number | string
  y: number | string
  scale: number | string
  rotation: number | string
  z_index: number
  text_value: string | null
  font_family: string | null
  font_weight: number | null
  color: string | null
  bg_color: string | null
  text_align: string | null
  image_path: string | null
  image_url: string | null
  created_at: string
}

function rowToOverlay(r: ServerRow): ClipOverlay {
  return {
    id: r.id,
    user_id: r.user_id,
    clip_kind: r.clip_kind as OverlayClipKind,
    clip_id: r.clip_id,
    kind: r.kind as 'text' | 'image',
    x: Number(r.x),
    y: Number(r.y),
    scale: Number(r.scale),
    rotation: Number(r.rotation),
    z_index: r.z_index,
    text_value: r.text_value,
    font_family: r.font_family,
    font_weight: r.font_weight,
    color: r.color,
    bg_color: r.bg_color,
    text_align: (r.text_align as 'left' | 'center' | 'right' | null) ?? null,
    image_path: r.image_path,
    image_url: r.image_url,
    created_at: r.created_at,
  }
}

export function useClipOverlays(userId: string | null | undefined) {
  const [overlays, setOverlays] = useState<ClipOverlay[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const reload = useCallback(async () => {
    if (!userId) { setOverlays([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('generator_clip_overlays')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (!error && data) setOverlays((data as unknown as ServerRow[]).map(rowToOverlay))
    setLoading(false)
  }, [userId])

  useEffect(() => { void reload() }, [reload])

  const byClip = useMemo(() => {
    const map = new Map<string, ClipOverlay[]>()
    for (const o of overlays) {
      const arr = map.get(o.clip_id) ?? []
      arr.push(o)
      map.set(o.clip_id, arr)
    }
    return map
  }, [overlays])

  const addText = useCallback(async (clipKind: OverlayClipKind, clipId: string) => {
    if (!userId) return
    const payload = {
      user_id: userId,
      clip_kind: clipKind,
      clip_id: clipId,
      ...DEFAULT_TEXT_OVERLAY,
    }
    const { data, error } = await supabase
      .from('generator_clip_overlays')
      .insert(payload)
      .select('*')
      .single()
    if (!error && data) {
      setOverlays((curr) => [...curr, rowToOverlay(data as unknown as ServerRow)])
      return (data as unknown as ServerRow).id
    }
  }, [userId])

  const addImage = useCallback(async (clipKind: OverlayClipKind, clipId: string, file: File) => {
    if (!userId) return
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from(OVERLAY_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })
    if (upErr) { console.warn('overlay upload failed', upErr); return }
    // Bucket is private — store the canonical "object/public/<bucket>/<key>"
    // URL form for compatibility with legacy rows. Read sites resolve it
    // through `resolveSignedUrl()` to a short-lived signed URL.
    const { data: pub } = supabase.storage.from(OVERLAY_BUCKET).getPublicUrl(path)
    const payload = {
      user_id: userId,
      clip_kind: clipKind,
      clip_id: clipId,
      ...DEFAULT_IMAGE_OVERLAY,
      image_path: path,
      image_url: pub.publicUrl,
    }
    const { data, error } = await supabase
      .from('generator_clip_overlays')
      .insert(payload)
      .select('*')
      .single()
    if (!error && data) {
      setOverlays((curr) => [...curr, rowToOverlay(data as unknown as ServerRow)])
      return (data as unknown as ServerRow).id
    }
  }, [userId])

  const update = useCallback((id: string, patch: Partial<ClipOverlay>) => {
    // Optimistic local update
    setOverlays((curr) => curr.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    // Debounce DB write per id
    const existing = debounceRef.current.get(id)
    if (existing) clearTimeout(existing)
    const t = setTimeout(async () => {
      debounceRef.current.delete(id)
      // Build column-only payload
      const dbPatch: Record<string, unknown> = {}
      for (const k of Object.keys(patch) as (keyof ClipOverlay)[]) {
        // Skip non-column / identity fields
        if (k === 'id' || k === 'user_id' || k === 'created_at') continue
        dbPatch[k] = patch[k] as unknown
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('generator_clip_overlays').update(dbPatch as any).eq('id', id)
    }, 300)
    debounceRef.current.set(id, t)
  }, [])

  const remove = useCallback(async (id: string) => {
    setOverlays((curr) => curr.filter((o) => o.id !== id))
    await supabase
      .from('generator_clip_overlays')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
  }, [])

  const getForClip = useCallback((clipId: string): ClipOverlay[] => {
    return byClip.get(clipId) ?? []
  }, [byClip])

  return { overlays, loading, byClip, getForClip, addText, addImage, update, remove, reload }
}
