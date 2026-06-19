# Modern Vivid Emerald Download Progress

Replace the current plain `45%` text shown inside the small download button while a file is converting/downloading with a polished, colorful **emerald circular progress ring** (the "Vivid emerald progress" direction the user chose).

## Where it changes

`src/modules/generator-ui/components/DownloadFormatMenu.tsx` is the single component rendering the download button for every library/film card. Its `busy` + `progress` branch currently renders:

```text
busy && progress != null  ->  <span>{progress}%</span>   (8px plain text)
busy && progress == null  ->  spinner
else                      ->  download icon
```

## What it will look like

When `progress` is a number, render a compact SVG circular ring sized to the existing 24px button footprint:

- Background track circle in `text-zinc-800/80`.
- Active progress arc in `text-emerald-500` with a soft glow (`drop-shadow-[0_0_4px_rgba(16,185,129,0.4)]`), `stroke-linecap="round"`, animated via `stroke-dashoffset` with `transition-all duration-500`.
- Center percentage number in bold emerald (`text-emerald-400`, tabular-nums), sized to stay readable in the small circle.
- The arc length is computed from `progress` (circumference `2·π·r`, `dashoffset = circumference · (1 - progress/100)`).
- `role="progressbar"` with aria values for accessibility.

The spinner (indeterminate, `progress == null`) and the idle download icon stay as-is. No change to download logic, props, or the dropdown menu.

## Technical notes

- Keep the existing button element, sizes (`h-6 w-6`), hover styles, and `disabled` behavior.
- Only the inner content of the `busy && progress != null` branch is swapped for the SVG ring.
- Self-contained Tailwind classes; no new dependencies, tokens, or files.
