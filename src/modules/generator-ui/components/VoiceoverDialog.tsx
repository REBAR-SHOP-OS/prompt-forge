import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Download, LoaderCircle, Mic, Music2, Sparkles, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  SoundtrackWaveform,
  type SoundtrackWaveformHandle,
} from '@/modules/generator-ui/components/SoundtrackWaveform'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

type Gender = 'female' | 'male' | 'child'
type Tone =
  | 'advertising'
  | 'excited'
  | 'calm'
  | 'narrative'
  | 'friendly'
  | 'serious'
  | 'dramatic'
  | 'whisper'
  | 'news'
  | 'storytelling'
  | 'cheerful'
  | 'sad'
  | 'angry'

const TONE_LABELS: { value: Tone; label: string }[] = [
  { value: 'advertising', label: 'Advertising' },
  { value: 'excited', label: 'Excited' },
  { value: 'calm', label: 'Calm' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'serious', label: 'Serious' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'whisper', label: 'Whisper / Soft' },
  { value: 'news', label: 'News Anchor' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'cheerful', label: 'Cheerful' },
  { value: 'sad', label: 'Sad / Emotional' },
  { value: 'angry', label: 'Angry / Intense' },
]

interface VoiceoverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseAsSoundtrack?: (url: string, name: string) => void
  // Active voiceover applied to the film + its timing/volume controls.
  activeVoiceoverUrl?: string | null
  activeVoiceoverName?: string | null
  voiceoverVolume?: number
  onVoiceoverVolumeChange?: (v: number) => void
  voiceoverRange?: [number, number]
  onVoiceoverRangeChange?: (r: [number, number]) => void
  voiceoverTimeline?: [number, number]
  onVoiceoverTimelineChange?: (r: [number, number]) => void
  voiceoverDuration?: number
  onVoiceoverDurationChange?: (d: number) => void
  mergedDurationSec?: number
  waveformRef?: MutableRefObject<SoundtrackWaveformHandle | null>
  onClearVoiceover?: () => void
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function formatTimeMS(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export function VoiceoverDialog({
  open,
  onOpenChange,
  onUseAsSoundtrack,
  activeVoiceoverUrl,
  activeVoiceoverName,
  voiceoverVolume = 1,
  onVoiceoverVolumeChange,
  voiceoverRange = [0, 0],
  onVoiceoverRangeChange,
  voiceoverTimeline = [0, 0],
  onVoiceoverTimelineChange,
  voiceoverDuration = 0,
  onVoiceoverDurationChange,
  mergedDurationSec = 0,
  waveformRef,
  onClearVoiceover,
}: VoiceoverDialogProps) {
  const [text, setText] = useState('')
  const [gender, setGender] = useState<Gender>('female')
  const [tone, setTone] = useState<Tone>('advertising')
  const [durationMode, setDurationMode] = useState<string>('auto')
  const [customDuration, setCustomDuration] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const lastUrlRef = useRef<string | null>(null)

  function resolveDurationSec(): number | undefined {
    if (durationMode === 'auto') return undefined
    if (durationMode === 'custom') {
      const n = Math.round(Number(customDuration))
      if (Number.isFinite(n) && n >= 1 && n <= 135) return n
      return undefined
    }
    const n = Number(durationMode)
    return Number.isFinite(n) ? n : undefined
  }

  // Cleanup blob URLs we created (not the one handed off to the parent).
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        try { URL.revokeObjectURL(lastUrlRef.current) } catch { /* ignore */ }
      }
    }
  }, [])

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setIsGenerating(false)
    }
  }, [open])

  async function persistVoiceover(blob: Blob) {
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const uid = userRes.user?.id
      if (!uid) return
      const type = (blob.type || '').toLowerCase()
      const ext = type.includes('mpeg') || type.includes('mp3') ? 'mp3'
        : type.includes('ogg') ? 'ogg'
        : type.includes('webm') ? 'webm'
        : type.includes('m4a') || type.includes('mp4') ? 'm4a'
        : 'wav'
      const path = `${uid}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('user-audio')
        .upload(path, blob, { contentType: blob.type || 'audio/wav', upsert: false })
      if (upErr) throw upErr
      await supabase.from('generator_user_audio').insert({
        user_id: uid,
        storage_path: path,
        kind: 'voiceover',
        name: `Voiceover (${gender}, ${tone})`,
        size_bytes: blob.size,
        mime_type: blob.type || null,
      })
    } catch (err) {
      console.error('Failed to save voiceover to storage', err)
    }
  }

  async function handleGenerate() {



    const trimmed = text.trim()
    if (!trimmed) {
      toast.error('Please write some text first')
      return
    }
    setIsGenerating(true)
    try {
      const durationSec = resolveDurationSec()
      const { data, error } = await supabase.functions.invoke('tts-generate', {
        body: { text: trimmed, gender, tone, ...(durationSec ? { durationSec } : {}) },
      })
      if (error) throw error
      const payload = data as {
        audioBase64?: string
        mimeType?: string
        error?: string
        warning?: string
      } | null
      if (!payload?.audioBase64) {
        throw new Error(payload?.error || 'No audio returned')
      }
      const blob = base64ToBlob(payload.audioBase64, payload.mimeType || 'audio/wav')
      // Revoke previous local URL
      if (lastUrlRef.current) {
        try { URL.revokeObjectURL(lastUrlRef.current) } catch { /* ignore */ }
      }
      const url = URL.createObjectURL(blob)
      lastUrlRef.current = url
      setAudioUrl(url)
      if (payload.warning) toast.warning(payload.warning)
      // Persist to Storage › Audio so every generated voiceover is saved.
      void persistVoiceover(blob)


    } catch (err) {
      console.error('Voiceover generation failed', err)
      toast.error(
        err instanceof Error
          ? `Voiceover failed: ${err.message}`
          : 'Voiceover failed',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function handleDownload() {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `voiceover-${gender}-${tone}-${Date.now()}.wav`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function handleUseAsSoundtrack() {
    if (!audioUrl) return
    const name = `Voiceover (${gender}, ${tone}).wav`
    onUseAsSoundtrack?.(audioUrl, name)
    // Hand off ownership so we don't revoke it.
    lastUrlRef.current = null
    setAudioUrl(null)
    setText('')
    // Keep the dialog open so the user can adjust timing/volume right here.
    toast.success('Voiceover set as soundtrack')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" aria-hidden="true" />
            Voiceover
          </DialogTitle>
          <DialogDescription>
            Type your text, choose a voice and tone, then generate a spoken
            voiceover with AI Studio (Gemini).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vo-text" className="text-xs uppercase tracking-wider text-zinc-400">
              Text
            </Label>
            <Textarea
              id="vo-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What should the voice say?"
              rows={5}
              maxLength={5000}
              className="resize-none border-white/10 bg-white/[0.04] text-zinc-100 placeholder:text-zinc-500"
            />
            <div className="text-right text-[10px] uppercase tracking-wider text-zinc-500">
              {text.length}/5000
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                Gender
              </Label>
              <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                Tone
              </Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_LABELS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                Duration
              </Label>
              <Select value={durationMode} onValueChange={setDurationMode}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="5">5 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                  <SelectItem value="15">15 seconds</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="45">45 seconds</SelectItem>
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {durationMode === 'custom' ? (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  Seconds (1–135)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={135}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="e.g. 20"
                  className="border-white/10 bg-white/[0.04] text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            ) : (
              <div className="flex items-end pb-1 text-[11px] leading-snug text-zinc-500">
                Voice is paced and fitted to the chosen length.
              </div>
            )}
          </div>


          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate voiceover
              </>
            )}
          </Button>

          {audioUrl ? (
            <div className="space-y-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
              <audio
                key={audioUrl}
                src={audioUrl}
                controls
                className="w-full"
              />
              {onUseAsSoundtrack ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUseAsSoundtrack}
                  >
                    <Music2 className="mr-2 h-3.5 w-3.5" />
                    Use as soundtrack
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeVoiceoverUrl ? (
            <div className="space-y-4 rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-300">
                  <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{activeVoiceoverName ?? 'Voiceover'}</span>
                </div>
                {onClearVoiceover ? (
                  <button
                    type="button"
                    onClick={onClearVoiceover}
                    aria-label="Remove voiceover"
                    className="grid h-6 w-6 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Voiceover volume</span>
                  <span className="tabular-nums text-zinc-200">{Math.round(voiceoverVolume * 100)}%</span>
                </div>
                <Slider
                  value={[Math.round(voiceoverVolume * 100)]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => onVoiceoverVolumeChange?.((v[0] ?? 0) / 100)}
                />
              </div>

              <SoundtrackWaveform
                ref={waveformRef}
                url={activeVoiceoverUrl}
                range={voiceoverRange[1] > voiceoverRange[0] ? voiceoverRange : [0, Math.max(0.1, voiceoverDuration)]}
                onReady={(d) => {
                  onVoiceoverDurationChange?.(d)
                  if (voiceoverRange[1] <= voiceoverRange[0]) onVoiceoverRangeChange?.([0, d])
                }}
                onRangeChange={(r) => { if (r[1] > r[0]) onVoiceoverRangeChange?.([r[0], r[1]]) }}
              />

              <div className="space-y-3 rounded-md border border-white/10 bg-black/40 p-3">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span className="font-medium">Play on video from … to</span>
                  <span className="tabular-nums text-zinc-200">
                    {formatTimeMS(voiceoverTimeline[0])} – {formatTimeMS(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Start</span>
                    <span className="tabular-nums text-zinc-200">{formatTimeMS(voiceoverTimeline[0])}</span>
                  </div>
                  <Slider
                    value={[Math.round(voiceoverTimeline[0])]}
                    min={0}
                    max={mergedDurationSec}
                    step={1}
                    onValueChange={(v) => {
                      const s = Math.min(v[0] ?? 0, (voiceoverTimeline[1] || mergedDurationSec) - 1)
                      onVoiceoverTimelineChange?.([Math.max(0, s), voiceoverTimeline[1] || mergedDurationSec])
                    }}
                  />
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>End</span>
                    <span className="tabular-nums text-zinc-200">{formatTimeMS(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)}</span>
                  </div>
                  <Slider
                    value={[Math.round(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)]}
                    min={0}
                    max={mergedDurationSec}
                    step={1}
                    onValueChange={(v) => {
                      const e = Math.max(v[0] ?? mergedDurationSec, voiceoverTimeline[0] + 1)
                      onVoiceoverTimelineChange?.([voiceoverTimeline[0], Math.min(mergedDurationSec, e)])
                    }}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Outside this window the voiceover is silent. Total film ≈ {formatTimeMS(mergedDurationSec)}.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleDownload}
            disabled={!audioUrl}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
