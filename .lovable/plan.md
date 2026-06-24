## Goal
When a user generates a **Product narration** in the Voiceover dialog, the script should end with a short promotional line about the company, using the business info the user already saved.

## Where the data lives
The user's company details are stored in the `generator_business_profiles` table:
- `business_info` (free-text description of the company / brand)
- `contact_website`, `contact_phone`, `contact_address`, `contact_logo_url`

The narration is created by the `ad-narration` edge function, which today receives only `{ productName, durationSec }` and never sees any company info.

## Changes

### 1. Frontend — `VoiceoverDialog.tsx` (`runNarration`)
- Before calling `ad-narration`, load the current user's `business_info` (and optionally the company/brand name from it) from `generator_business_profiles` (same query pattern already used in `ProductAdDialog.tsx`).
- Pass it to the function: `body: { productName, durationSec, businessInfo }`.
- This stays purely in presentation/data-fetch code.

### 2. Edge function — `supabase/functions/ad-narration/index.ts`
- Accept an optional `businessInfo` string in the request body.
- When present, extend the prompt so the narration **closes with one short promotional sentence about the company** (a branded call-to-action naming the company/brand), right after the product copy.
- Keep the existing rule that no numbers/codes/SKUs are spoken. Phone numbers, prices and website URLs from the business info will NOT be read aloud — the company promo will reference the brand/company by name and value proposition only (contact details continue to appear via the on-video overlay). 
- Keep total length aligned with the requested `durationSec` (the closing company line is part of the same word budget).
- If `businessInfo` is empty/missing, behavior is unchanged (product-only narration).

## Notes / decisions for you
- The spoken company promo will mention the **company/brand name and message**, but not phone numbers, website URLs, or prices, because the function intentionally never voices digits/codes. The contact details remain as the burned-in overlay on the Final Film. If you instead want the website/phone spoken, that's a separate change to the no-numbers rule — tell me and I'll include it.

## Verification
- Typecheck clean.
- With a saved company profile, generate a Product narration → the text ends with a branded company promo line.
- With no company profile saved → narration is product-only (no regression).
