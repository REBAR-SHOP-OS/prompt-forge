import { useEffect, useState } from 'react'
import { Clapperboard, LoaderCircle, RefreshCw, Copy, Check, Wand2 } from 'lucide-react'
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
}

const DURATIONS: ScenarioDuration[] = [5, 10, 15, 45]

export default function ScenarioWriterDialog({
  open,
  onOpenChange,
  defaultDuration,
  onUseAsPrompt,
}: Props) {
  const [duration, setDuration] = useState<ScenarioDuration>(defaultDuration)
  const [idea, setIdea] = useState('')
  const [isWriting, setIsWriting] = useState(false)
  const [scenario, setScenario] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Re-sync duration when dialog re-opens.
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
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('scenario-write', {
        body: { idea: idea.trim(), durationSeconds: duration },
      })
      if (invokeErr) {
        setError(invokeErr.message || 'Failed to write scenario')
        return
      }
      const text = (data as { scenario?: string } | null)?.scenario?.trim() ?? ''
      if (!text) {
        setError('Empty AI response')
        return
      }
      setScenario(text)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to write scenario')
    } finally {
      setIsWriting(false)
    }
  }

  async function handleCopy() {
    if (!scenario) return
    try {
      await navigator.clipboard.writeText(scenario)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* noop */
    }
  }

  function handleUseAsPrompt() {
    if (!scenario) return
    onUseAsPrompt(scenario)
    onOpenChange(false)
  }

  function reset() {
    setIdea('')
    setScenario('')
    setError(null)
    setCopied(false)
  }

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

          {scenario ? (
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Scenario ({duration}s)
              </div>
              <p
                dir="ltr"
                className="whitespace-pre-wrap text-sm leading-6 text-zinc-100"
              >
                {scenario}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {scenario ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={isWriting}
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={generate}
                disabled={isWriting || !idea.trim()}
              >
                {isWriting ? (
                  <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Regenerate
              </Button>
              <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting}>
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Use as prompt
              </Button>
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
