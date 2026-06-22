## Plan: Show translation below the original (original kept as reference)

Selecting a language currently replaces the original transcript with the translation. Change it so the original stays visible as reference and the translation appears beneath it.

### Change — `src/modules/generator-ui/components/TranscriptPanel.tsx`

**Rendering (lines ~241–280):**
- Always render the **Original** block (existing word-by-word renderer with low-confidence highlighting + clickable pronunciation), driven by `words`/`transcript`, regardless of selected language.
- When `language !== ORIGINAL`, render a **Translation** block below it showing `displayText`, with RTL direction from the selected language's `rtl` flag.
- Add small section labels ("Original" and the selected language's label) styled like existing `text-xs uppercase tracking-wide text-zinc-400` headers, with a thin divider between blocks.

**State handling:**
- `showWords` = render original with word highlighting whenever `words.length > 0` (no longer gated to `language === ORIGINAL`); falls back to `transcript` text when there are no words.
- Low-confidence legend keeps showing for the original block.
- RTL: original block uses Persian-char detection on the transcript; translation block uses the selected language's `rtl` flag.
- `handleLanguageChange` translation loading/caching logic unchanged.

### Result
- Language = Original → only the original block (current behavior).
- Language = a translation → original block on top (reference, still highlight/click-to-hear), translated text below under its language label.