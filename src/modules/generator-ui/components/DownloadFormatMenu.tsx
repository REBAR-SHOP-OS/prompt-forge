import { Download, LoaderCircle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Detect the real file format from a storage URL (query string stripped).
export function detectSourceFormat(url: string): 'mp4' | 'webm' | 'mov' | 'video' {
  const lower = (url || '').toLowerCase().split('?')[0]
  if (lower.endsWith('.mp4')) return 'mp4'
  if (lower.endsWith('.webm')) return 'webm'
  if (lower.endsWith('.mov')) return 'mov'
  return 'video'
}

/**
 * Single download icon that opens a dropdown so the user explicitly picks the
 * format they want. The original format is always offered (fast, reliable).
 * MP4 is offered as a separate conversion option when the source isn't already
 * an MP4; if the source already is MP4 the original IS the MP4.
 */
export function DownloadFormatMenu({
  url,
  busy,
  progress,
  onDownloadOriginal,
  onDownloadMp4,
}: {
  url: string
  busy: boolean
  /** 0..100 transcode progress, or null when not transcoding. */
  progress: number | null
  onDownloadOriginal: () => void
  onDownloadMp4: () => void
}) {
  const fmt = detectSourceFormat(url)
  const sourceIsMp4 = fmt === 'mp4'
  const originalLabel =
    fmt === 'video' ? 'Download original file' : `Download original (${fmt.toUpperCase()})`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => e.stopPropagation()}
          aria-label="Download"
          title="Download"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
        >
          {busy ? (
            progress != null ? (
              <span className="text-[8px] font-semibold leading-none">{progress}%</span>
            ) : (
              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
            )
          ) : (
            <Download className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel>Choose download format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onDownloadOriginal() }}
        >
          {originalLabel}
        </DropdownMenuItem>
        {!sourceIsMp4 ? (
          <DropdownMenuItem
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); onDownloadMp4() }}
          >
            Download as MP4 (converted)
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default DownloadFormatMenu
