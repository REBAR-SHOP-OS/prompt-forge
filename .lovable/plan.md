# Contact info in the Product Ad Scenario modal → used by the video overlay

## Goal
Inside the **Product Ad Scenario** dialog (the same place that holds "About your business"), let the user enter and **save** the company **website, phone, and address**. Then reuse that saved data automatically for the **Contact overlay** that gets burned onto the films — so the user enters it once in one place.

## Current state
- The dialog (`ProductAdDialog.tsx`) saves only `business_info` to the `generator_business_profiles` table (columns today: `user_id`, `business_info`, `updated_at`).
- The Contact overlay lives separately in `DashboardPage.tsx` as `contactOverlay` (website/phone/address/enabled/position), persisted only in `localStorage` under `project-contact:${userId}`.
- These two are disconnected — contact info typed in the toolbar Contact popover is not the same as the business modal.

## What will change

### 1. Backend (single source of truth)
Add three nullable text columns to the existing `generator_business_profiles` table:
- `contact_website`
- `contact_phone`
- `contact_address`

This keeps contact info next to the business profile, persisted per user, surviving refresh and project switches.

### 2. Product Ad Scenario modal (`ProductAdDialog.tsx`)
- In the business info popover (the `Building2` icon area), add a **Contact details** block with three optional inputs: Website, Phone, Address (localized labels for all 6 existing languages).
- Load these values together with `business_info` when the dialog opens.
- Save them in the same `Save` action (and in the silent upsert that runs on Generate), upserting all four fields at once.

### 3. Contact overlay (`DashboardPage.tsx`)
- On load, fetch `contact_website / contact_phone / contact_address` from `generator_business_profiles` and populate `contactOverlay` from it (the modal becomes the source of truth for the text).
- Keep the user's `enabled` and `position` choices in `localStorage` as today.
- The existing burn-in pipeline (`mergeVideoUrls` overlay + live preview) stays unchanged — it just now reads the values saved in the modal, so videos show the saved contact info.

## Scope / safety
- Frontend + one additive, non-destructive DB migration (new nullable columns only; existing data untouched).
- Migration includes the required `GRANT`s for the new columns' table access (table already exists with RLS; column adds inherit existing policies).
- No change to video rendering logic, no removal of the existing toolbar Contact popover behavior — it will simply share the same persisted data.

## Technical notes
- Migration: `ALTER TABLE public.generator_business_profiles ADD COLUMN IF NOT EXISTS contact_website text, ADD COLUMN ... ;` (RLS/policies already in place for this table).
- `ProductAdDialog`: extend the `select('business_info')` load to also select the 3 contact columns; extend both `upsert(...)` calls to include them.
- `DashboardPage`: in the contact-overlay init effect, after reading localStorage for enabled/position, query the table for the 3 text fields and merge them into `contactOverlay`.
