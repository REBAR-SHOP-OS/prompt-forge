import { useEffect, useState } from 'react'
import { Clapperboard, LoaderCircle, RefreshCw, Copy, Check, Wand2, Send } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/integrations/supabase/client'

export type ScenarioDuration = 5 | 10 | 15 | 45

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDuration: ScenarioDuration
  onUseAsPrompt: (scenario: string) => void
  onSendScenes?: (scenes: string[]) => void | Promise<void>
}

const DURATIONS: ScenarioDuration[] = [5, 10, 15, 45]
const SCENE_RANGES = ['0–15s', '15–30s', '30–45s']

export default function ScenarioWriterDialog({
  open,
  onOpenChange,
  defaultDuration,
  onUseAsPrompt,
  onSendScenes,
}: Props) {
  const [duration, setDuration] = useState<ScenarioDuration>(defaultDuration)
  const [idea, setIdea] = useState('')
  const [isWriting, setIsWriting] = useState(false)
  const [scenes, setScenes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null) // -1 = "all"
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (open) {
      setDuration(defaultDuration)
      setError(null)
    }
  }, [open, defaultDuration])

  async function generate() {
    if (!idea.trim() || isWriting) return
    setIsWriting(true)
    setError(null)
    setScenes([])
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('scenario-write', {
        body: { idea: idea.trim(), durationSeconds: duration },
      })
      if (invokeErr) {
        setError(invokeErr.message || 'Failed to write scenario')
        return
      }
      const payload = data as { scenario?: string; scenes?: string[]; warning?: string } | null
      const list = (payload?.scenes ?? []).map((s) => s.trim()).filter(Boolean)
      if (list.length === 0) {
        setError('Empty AI response')
        return
      }
      setScenes(list)
      if (payload?.warning) setError(payload.warning)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to write scenario')
    } finally {
      setIsWriting(false)
    }
  }

  async function copyText(text: string, idx: number) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(idx)
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500)
    } catch {
      /* noop */
    }
  }

  function handleUseAsPrompt() {
    if (scenes.length === 0) return
    onUseAsPrompt(scenes.join('\n\n'))
    onOpenChange(false)
  }

  async function handleSendAll() {
    if (scenes.length !== 3 || !onSendScenes || isSending) return
    setIsSending(true)
    setError(null)
    try {
      await onSendScenes(scenes)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to send to Pending')
    } finally {
      setIsSending(false)
    }
  }

  function reset() {
    setIdea('')
    setScenes([])
    setError(null)
    setCopiedIndex(null)
    setIsSending(false)
  }

  const isSplit = duration === 45 && scenes.length === 3
  const concatenated = scenes.join('\n\n')

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-amber-300" aria-hidden="true" />
            Scenario Writer
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pick a duration, describe your idea (any language), and get an English
            cinematic scenario tuned to that length.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Duration
            </div>
            <div
              role="radiogroup"
              aria-label="Scenario duration"
              className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold"
            >
              {DURATIONS.map((sec) => {
                const active = duration === sec
                return (
                  <button
                    key={sec}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDuration(sec)}
                    className={`rounded-full px-3 py-1.5 transition ${
                      active
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sec}s
                  </button>
                )
              })}
            </div>
            {duration === 45 ? (
              <p className="mt-2 text-xs text-zinc-500">
                Will be split into 3 sequential 15s scenes and sent as 3 cards.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Your idea
            </div>
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder="Describe your idea (any language)…"
              className="min-h-[100px] border-white/10 bg-black/30 text-zinc-100"
            />
          </div>

          {error ? (
            <p className="text-xs leading-5 text-rose-300">{error}</p>
          ) : null}

          {isSplit ? (
            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {scenes.map((text, i) => (
                <div
                  key={i}
                  className="rounded-md border border-white/10 bg-black/30 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Scene {i + 1} ({SCENE_RANGES[i]})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => copyText(text, i)}
                      disabled={isWriting || isSending}
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      )}
                      {copiedIndex === i ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          ) : scenes.length > 0 ? (
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Scenario ({duration}s)
              </div>
              <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                {scenes[0]}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {scenes.length > 0 ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(concatenated, -1)}
                disabled={isWriting || isSending}
              >
                {copiedIndex === -1 ? (
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {copiedIndex === -1 ? 'Copied' : isSplit ? 'Copy all' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={generate}
                disabled={isWriting || isSending || !idea.trim()}
              >
                {isWriting ? (
                  <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Regenerate
              </Button>
              {isSplit && onSendScenes ? (
                <Button size="sm" onClick={handleSendAll} disabled={isWriting || isSending}>
                  {isSending ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  Send all to Pending
                </Button>
              ) : (
                <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting || isSending}>
                  <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Use as prompt
                </Button>
              )}
            </>
          ) : (
            <Button onClick={generate} disabled={isWriting || !idea.trim()} size="sm">
              {isWriting ? (
                <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              Write scenario
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
