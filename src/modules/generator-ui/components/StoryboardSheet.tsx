import React from 'react'
import { Pencil, RefreshCw, ZoomIn, LoaderCircle, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'
import type { FilmPlan, FilmAspect } from '@/modules/generator-ui/lib/makeFilmWizard'

interface StoryboardSheetProps {
  plans: FilmPlan[]
  images: (string | undefined)[]
  regenIndex: number | null
  onRegenerate: (index: number) => void
  onEdit: (index: number) => void
  onZoom: (url: string, text: string) => void
  working: boolean
  aspect: FilmAspect
}

export function StoryboardSheet({
  plans,
  images,
  regenIndex,
  onRegenerate,
  onEdit,
  onZoom,
  working,
  aspect,
}: StoryboardSheetProps) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
      {plans.map((plan, i) => {
        const url = safeMediaUrl(images[i])
        const isRegen = regenIndex === i
        return (
          <div key={i} className="space-y-2 rounded-md border border-border bg-accent/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                Shot {i + 1}
              </div>
              <div className="flex items-center gap-1">
                {url && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    aria-label={`Edit image for shot ${i + 1}`}
                    title={`Edit image for shot ${i + 1}`}
                    onClick={() => onEdit(i)}
                    className="h-7 gap-1 px-2 text-xs text-foreground/80 hover:text-fuchsia-100"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                )}
                {url && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onZoom(url, plan.scenarioText)}
                    className="h-7 gap-1 px-2 text-xs text-foreground/80 hover:text-fuchsia-100"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                    Zoom
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={working}
                  onClick={() => onRegenerate(i)}
                  className="h-7 gap-1 px-2 text-xs text-foreground/80 hover:text-fuchsia-100"
                >
                  {isRegen ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Regenerate
                </Button>
              </div>
            </div>
            <div
              className="grid w-full place-items-center overflow-hidden rounded bg-surface-2/60 cursor-pointer"
              style={{ aspectRatio: aspect === '9:16' ? '9/16' : aspect === '16:9' ? '16/9' : '1/1' }}
              onClick={() => url && onZoom(url, plan.scenarioText)}
            >
              {isRegen ? (
                <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : url ? (
                <img src={url} alt={`Preview for scene ${i + 1}`} className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" aria-hidden="true" />
                  <span className="text-[11px]">No image — regenerate</span>
                </div>
              )}
            </div>
            <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{plan.scenarioText}</p>
          </div>
        )
      })}
    </div>
  )
}
