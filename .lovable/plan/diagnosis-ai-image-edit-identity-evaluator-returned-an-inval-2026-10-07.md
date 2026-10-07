# Diagnosis: ai-image-edit "Identity evaluator returned an invalid response"

## Evidence (read-only)
- Function logs for `ai-image-edit` (last ~2 days) hold only boot/shutdown events; no error, warning or evaluator line was retained. Exact output shape is therefore **unconfirmed**.
- AI Gateway logs: every `google/gemini-3-flash-preview` call on 2026-10-06/07 returned HTTP 200 (e.g. 17:32:41Z log `01a1176c-a16b-74d6…`, 3920 in / 122 out tokens). No 4xx/5xx, so this is not a gateway error envelope (that path logs "identity-eval gateway error" and returns a different message). Payload state is `unavailable`, so the content cannot be read.
- 122–148 output tokens is enough for a complete 1–2 reference JSON, so truncation is unlikely but not ruled out.
- The deployed source cannot be pulled for a byte diff; the repo version is the last one deployed in this project, so they are treated as equal (unverified).

## How the error is produced (repo code)
`ai-image-edit/index.ts` lines 251-278: evaluator is called with **no JSON mode** and **no re-ask**. 502 is returned when any of these happen:
1. `message.content` empty (also when content is an array of parts, `String()` gives "[object Object]" and fails to parse).
2. Text that is not valid JSON after stripping fences (prose, or a trailing note that contains `}`).
3. `perReference` missing or length not equal to the number of judged references (most likely: model returns one entry per uploaded image, or merges product+character).
4. `present`/`match` given as strings (`"true"`) instead of booleans — the parser rejects strings, unlike the preview-quality parser.
- Fenced JSON alone is handled and is not the cause.
- Nothing about the raw reply is logged, which is why the logs can't tell us which case it was.

## Minimal repair (not applied)
1. Log safe metadata only on parse failure: content length, type, fence present, `perReference` length vs expected, finish_reason. No text or image data.
2. Add `response_format: { type: "json_object" }` to the evaluator call.
3. Accept `"true"`/`"false"` strings for `present`/`match`; keep unknown values fail-closed.
4. Re-ask the evaluator once (max 2 attempts) before returning 502 — same pattern already proven in `film-preview-quality`.
5. Tests for each case above; deploy only `ai-image-edit` after approval.
