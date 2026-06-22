## Goal

Make each generated scene show the **scenario (visual description) first, then a clearly-labeled narration paragraph**, so the user understands what the narration says — instead of the narration being buried inline inside the action text (`Character says: "..."`).

Target result per scene:

```text
EXT. CONSTRUCTION SITE - DAY
A whip pan reveals the "circular tie" product, glowing, held by the smiling
character against a blurred construction backdrop. The camera whip-pans to a
close-up on the product's texture. Bright, sunny lighting.

Narration: "Tired of rebar chaos? Rebar.Shop introduces the innovation you've
been waiting for!"
```

## Where it changes

The scene text comes from the `scenario-write` edge function (`buildSystemPrompt`). Both the **Product Ad** and **Scenario Writer** dialogs render whatever it returns, so changing the prompt format fixes both at once.

### 1. `supabase/functions/scenario-write/index.ts` — `buildSystemPrompt`
- Replace the current inline-narration instruction (`narrationMulti` / `narrationSingle`, which say `formatted inline as Character says: "..."`) with a **structured order** instruction:
  - Write the **visual scenario first** (subject, action, camera move, lighting) with **no spoken lines mixed in**.
  - Then, on a **new line**, write the narration on its own, prefixed with a localized label `Narration:` followed by the spoken voiceover/dialogue in quotes.
  - Keep word-count rules; the narration line counts toward the limit.
  - Keep the `===SCENE===` delimiter and "exactly N scene blocks" rule unchanged so server-side scene splitting still works.
- Add a localized narration label driven by `outputLanguage`:
  - en `Narration`, fa `نریشن`, ar `التعليق الصوتي`, tr `Anlatım`, es `Narración`, fr `Narration`.
- Apply this to both the multi-scene and single-scene branches. Use it for ad scenarios (the Product Ad case, with or without an on-screen character) and the default advertising persona; for character-sheet films the narration line carries the character's spoken lines.

### 2. `src/modules/generator-ui/components/ProductAdDialog.tsx` (and same render in `ScenarioWriterDialog.tsx`) — light display emphasis
- When rendering each scene block, detect the narration paragraph (line starting with the localized `Narration:` label) and render that part with a subtle emphasis (e.g. a small "Narration" chip / bolded label and slightly highlighted text), while the scenario text above stays normal.
- Falls back gracefully: if no narration label is present, the block renders exactly as today.
- Keep `whitespace-pre-wrap`; keep `dir="auto"` so Persian/Arabic narration renders right-to-left.

## Consistency note
- The existing per-card narration icon (added earlier, extracts quoted lines) keeps working — the quoted narration is still present, now also clearly labeled.

## Verification
- Deploy the edge function; `curl`/generate a 30s product ad in English and confirm each scene has the visual description first and a separate `Narration:` line; repeat in Persian and confirm the `نریشن` label and RTL rendering.
- In the preview, open Product Ad Scenario and Scenario Writer, generate, and confirm scenario-then-narration layout with the narration visually distinguished.

## Notes
- Prompt/format change plus a small presentational tweak — no schema or generation-pipeline changes. The full scene text (scenario + narration) is still what gets sent to video generation, which also improves spoken-audio results.