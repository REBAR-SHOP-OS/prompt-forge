import { useEffect, useState } from 'react'
import {
  Clapperboard,
  LoaderCircle,
  RefreshCw,
  Wand2,
  Film,
  ArrowRight,
  ArrowLeft,
  Check,
  ImageIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'

type WizardStep = 'prompt' | 'scenario' | 'images'

export interface MakeFilmWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prompt already typed in the composer, if any. */
  initialPrompt: string
  /** Selected clip duration, shown so the user knows how many scenes to expect. */
  durationSeconds: number
  /** Step 1 — write the scene-by-scene scenario from the prompt. */
  writeScenario: (prompt: string) => Promise<string[]>
  /** Step 2 / regenerate — generate ONE scene's preview start image. Returns a URL. */
  generateSceneImage: (sceneText: string) => Promise<string>
  /**
   * Final approval — seed one video job per scene with the approved images and
   * start the render. This is the ONLY path that renders video, and it only
   * fires from the explicit "Approve & Make Film" click.
   */
  onApprove: (scenes: string[], perSceneImageUrls: (string | undefined)[]) => void
}

// Step-gated replacement for the old one-click auto-film. Nothing renders video
// until the user reviews the scenario, reviews (and optionally regenerates) one
// preview image per scene, and clicks "Approve & Make Film".
export function MakeFilmWizardDialog({
  open,
  onOpenChange,
  initialPrompt,
  durationSeconds,
  writeScenario,
  generateSceneImage,
  onApprove,
}: MakeFilmWizardDialogProps) {
  const [step, setStep] = useState<WizardStep>('prompt')
  const [prompt, setPrompt] = useState('')
  const [scenes, setScenes] = useState<string[]>([])
  const [images, setImages] = useState<(string | undefined)[]>([])
  const [busy, setBusy] = useState<'idle' | 'scenario' | 'images'>('idle')
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  // Reset the wizard to a clean first step whenever it (re)opens, seeding the
  // prompt from whatever is already in the composer.
  useEffect(() => {
    if (open) {
      setStep('prompt')
      setPrompt(initialPrompt ?? '')
      setScenes([])
      setImages([])
      setBusy('idle')
      setRegenIndex(null)
      setError(null)
      setProgress(null)
    }
  }, [open, initialPrompt])

  const working = busy !== 'idle' || regenIndex !== null

  async function handleWriteScenario() {
    const idea = prompt.trim()
    if (!idea) {
      setError('Type a prompt first so I can write the film.')
      return
    }
    setBusy('scenario')
    setError(null)
    setProgress('Writing your film scenario…')
    try {
      const written = await writeScenario(idea)
      const cleaned = written.map((s) => s.trim()).filter((s) => s.length > 0)
      if (cleaned.length === 0) {
        setError('The scenario came back empty — try rephrasing your prompt.')
        return
      }
      setScenes(cleaned)
      setImages(new Array(cleaned.length).fill(undefined))
      setStep('scenario')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the scenario.')
    } finally {
      setBusy('idle')
      setProgress(null)
    }
  }

  async function handleGenerateImages() {
    if (scenes.length === 0) return
    setBusy('images')
    setError(null)
    const next: (string | undefined)[] = new Array(scenes.length).fill(undefined)
    for (let i = 0; i < scenes.length; i++) {
      setProgress(`Designing preview image ${i + 1} of ${scenes.length}…`)
      try {
        next[i] = await generateSceneImage(scenes[i])
      } catch (err) {
        // One image failing must not block review — leave it empty and let the
        // user regenerate that single scene.
        console.error(`Make-film wizard: preview image ${i + 1} failed`, err)
        next[i] = undefined
      }
      setImages([...next])
    }
    setBusy('idle')
    setProgress(null)
    setStep('images')
  }

  async function handleRegenerate(index: number) {
    if (working) return
    setRegenIndex(index)
    setError(null)
    try {
      const url = await generateSceneImage(scenes[index])
      setImages((cur) => {
        const copy = [...cur]
        copy[index] = url
        return copy
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not regenerate image ${index + 1}.`)
    } finally {
      setRegenIndex(null)
    }
  }

  function handleApprove() {
    // Close first, then start the render in the background — identical to how the
    // old auto path proceeded after seeding jobs.
    onOpenChange(false)
    onApprove(scenes, images)
  }

  const stepLabel =
    step === 'prompt' ? 'Step 1 of 3 · Prompt' : step === 'scenario' ? 'Step 2 of 3 · Scenario' : 'Step 3 of 3 · Preview images'

  return (
    <Dialog open={open} onOpenChange={(v) => (working ? undefined : onOpenChange(v))}>
      <DialogContent className="max-w-3xl border-white/10 bg-zinc-950/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Clapperboard className="h-5 w-5 text-fuchsia-300" aria-hidden="true" />
            Make Full Film
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {stepLabel}. Review the scenario and one preview image per scene. Nothing renders until you approve.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {/* Step 1 — write / edit the prompt. */}
          {step === 'prompt' && (
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Your prompt
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the film you want (any language)…"
                rows={5}
                className="resize-none border-white/10 bg-white/[0.03] text-sm text-zinc-100"
              />
              <p className="text-xs text-zinc-500">
                Duration: {durationSeconds}s. The AI will write a scene-by-scene scenario you can review before any video is made.
              </p>
            </div>
          )}

          {/* Step 2 — review / edit the scenario. */}
          {step === 'scenario' && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">
                Here is the scenario the AI wrote. Edit any scene, then generate one preview image per scene.
              </p>
              {scenes.map((scene, i) => (
                <div key={i} className="space-y-1.5 rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                    Scene {i + 1}
                  </div>
                  <Textarea
                    value={scene}
                    onChange={(e) =>
                      setScenes((cur) => {
                        const copy = [...cur]
                        copy[i] = e.target.value
                        return copy
                      })
                    }
                    rows={3}
                    className="resize-none border-white/10 bg-white/[0.03] text-sm text-zinc-100"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 3 — review preview images, regenerate any, then approve. */}
          {step === 'images' && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">
                One preview image per scene. Regenerate any you dislike. When you are happy, approve to render the film.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {scenes.map((scene, i) => {
                  const url = safeMediaUrl(images[i])
                  const isRegen = regenIndex === i
                  return (
                    <div key={i} className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                          Scene {i + 1}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={working}
                          onClick={() => handleRegenerate(i)}
                          className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:text-fuchsia-100"
                        >
                          {isRegen ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Regenerate
                        </Button>
                      </div>
                      <div className="grid aspect-video place-items-center overflow-hidden rounded bg-black/40">
                        {isRegen ? (
                          <LoaderCircle className="h-6 w-6 animate-spin text-zinc-500" aria-hidden="true" />
                        ) : url ? (
                          <img src={url} alt={`Preview for scene ${i + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-zinc-600">
                            <ImageIcon className="h-6 w-6" aria-hidden="true" />
                            <span className="text-[11px]">No image — regenerate</span>
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-4 text-zinc-500">{scene}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {progress && (
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {progress}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer navigation — one action per step; approval is the only path to video. */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <div>
            {step === 'scenario' && (
              <Button
                type="button"
                variant="ghost"
                disabled={working}
                onClick={() => setStep('prompt')}
                className="gap-1 text-zinc-400"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Prompt
              </Button>
            )}
            {step === 'images' && (
              <Button
                type="button"
                variant="ghost"
                disabled={working}
                onClick={() => setStep('scenario')}
                className="gap-1 text-zinc-400"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Scenario
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 'prompt' && (
              <Button
                type="button"
                disabled={busy === 'scenario' || prompt.trim().length === 0}
                onClick={handleWriteScenario}
                className="gap-1.5 bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
              >
                {busy === 'scenario' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                )}
                Write scenario
              </Button>
            )}
            {step === 'scenario' && (
              <Button
                type="button"
                disabled={busy === 'images'}
                onClick={handleGenerateImages}
                className="gap-1.5 bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
              >
                {busy === 'images' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                )}
                Generate preview images
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {step === 'images' && (
              <Button
                type="button"
                disabled={working}
                onClick={handleApprove}
                className="gap-1.5 bg-emerald-500/90 text-white hover:bg-emerald-500"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Approve &amp; Make Film
                <Film className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MakeFilmWizardDialog
