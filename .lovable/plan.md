## Plan: Rename brand to "REBAR SHOP AI VIDEO"

Replace all occurrences of "Prompt Forge" with the new brand name "REBAR SHOP AI VIDEO" across the project.

### Files to change

1. **index.html**
   - `<title>` tag
   - `og:title` meta tag
   - `twitter:title` meta tag
   - Update `description`, `og:description`, and `twitter:description` to match the new brand identity

2. **src/pages/auth/LoginPage.tsx**
   - Showcase heading (line ~27)
   - `alt` attributes on logo images (lines ~22 and ~43)

3. **supabase/functions/local-llm-plan-video/index.ts**
   - System prompt identity line (line ~141): "You are Prompt Forge's local video prompt planner." → "You are REBAR SHOP AI VIDEO's local video prompt planner."

### No other changes
- No functional/logic changes.
- No backend schema or auth changes.
- No design/ layout changes beyond text replacement.