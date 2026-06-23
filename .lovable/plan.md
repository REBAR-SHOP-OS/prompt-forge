# Add company-logo upload to the Product Ad Scenario modal

## Goal
Add a **company logo upload** to the **Contact details (shown on video)** section of the Product Ad Scenario modal (`ProductAdDialog.tsx`), matching the logo capability already in the toolbar Contact popover. The logo is saved to the same single source of truth (`generator_business_profiles.contact_logo_url`), so it automatically appears as the overlay on generated videos.

## Background
- The `contact_logo_url` column already exists on `generator_business_profiles` (added previously). No migration needed.
- The toolbar Contact popover already uploads/persists the logo and burns it into the film; this change simply lets users also set it from this modal.

## Changes (all in `src/modules/generator-ui/components/ProductAdDialog.tsx`)

### 1. Localized label
Add a `contactLogo` label key (e.g. "Company logo") to all 6 language blocks (English, Persian, Arabic, Turkish, Spanish, French).

### 2. State
Add `const [contactLogo, setContactLogo] = useState('')` alongside the existing contact state.

### 3. Load
In the profile-load effect (~1220), add `contact_logo_url` to the `.select(...)` and set `setContactLogo(data.contact_logo_url ?? '')`.

### 4. Save
Add `contact_logo_url: contactLogo || null` to **both** upsert calls (the explicit `saveBusinessInfo` ~1302 and the pre-generation upsert ~1351).

### 5. Upload handler
Add a handler that reads the chosen image file, downscales it to <=256px on an offscreen canvas, converts to a PNG data URL, and stores it in `contactLogo` (same approach as the toolbar popover, keeps the stored value small and CORS-safe).

### 6. UI (in the contact block ~1628)
Add a Logo row: a thumbnail preview (or a placeholder icon when empty), an **Upload/Replace** file button, and a **Remove** button when a logo is set. Changing the logo also calls `setBusinessSaved(false)` like the other fields.

## Scope / safety
- Frontend-only change in one file; no schema change; no change to video rendering.
- Reuses the existing `contact_logo_url` column and existing overlay burn-in pipeline.
- Logo stays optional; existing behavior is unchanged when no logo is set.
