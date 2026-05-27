# Add Film Cover via AI

## Goal
Add a new Camera icon (📷) button next to the existing Sparkles AI-image button. Clicking it opens the same `Generate image with AI` dialog, but the resulting image is treated as the **film cover** and pinned as a special card at the **top** of the Pending column (not staged as a Start frame).

## UX
- **New button:** Camera icon (`lucide-react` `Camera`) placed immediately after the existing Sparkles button (around line 6034–6042 in `DashboardPage.tsx`), same circular style.
- **Tooltip / aria:** "Generate film cover with AI".
- **Dialog:** Reuses `AiImageDialog` unchanged. We open it with a new mode flag (`mode: 'cover'`) so `onSaved` knows to route the result to the cover slot instead of the Start frame.
- **Pending column:** The generated cover renders as the **first card** in Pending with a small `COVER` badge in the corner. It shows the image full-bleed using the locked project aspect ratio. Only one cover per project — generating a new one replaces it.
- **Behavior:** The cover card is NOT a generation source (not added to `manualOrder` or merge sequence by default). It's metadata for the project — displayed as the visual cover and included as the first 1-second still in the final merged video (image-to-clip via existing `imageToClip` helper) when present.

## Implementation

### 1. State + persistence (`DashboardPage.tsx`)
- Add `const [coverImage, setCoverImage] = useState<UserImageItem | null>(null)` keyed per active draft/project. Persist alongside `draftSourceImages` as `draftCoverImage: Record<draftId, UserImageItem>` (localStorage). On project switch, hydrate the cover for that scope.
- Add a small helper `setProjectCover(image)` that writes to both state and persisted map, scoped to `activeDraftId` (or `selectedProjectId` if a finalized project is open).

### 2. Open dialog in "cover mode"
- Add `aiDialogMode: 'frame' | 'cover'` state, default `'frame'`.
- New Camera button sets `setAiDialogMode('cover')` then `setIsAiImageDialogOpen(true)`.
- Existing Sparkles button sets `setAiDialogMode('frame')` first.

### 3. Route the saved image
In the `<AiImageDialog onSaved={...}>` handler (line ~4637), branch on `aiDialogMode`:
- `'frame'`: keep current behavior (Start frame staging).
- `'cover'`: call `setProjectCover(row)`, exclude the image from `visibleUserImages` (add its id to a `coverImageIds` Set so it doesn't double-render as a normal source image), and skip all Start-frame staging code.

### 4. Render the cover card at top of Pending
- In the Pending panel JSX (around the `displayedClips` map, ~line 5135+), render a dedicated `<CoverCard image={coverImage} onRemove={...} onRegenerate={...} />` above the regular clip list when `coverImage` is set.
- Styling matches existing clip cards (rounded, border, aspect ratio from `lockedProjectRatio ?? aspectRatio`) with an amber `COVER` chip top-left.

### 5. Include in final merge (optional, on by default)
In `handleMergeAllVideos`, if `coverImage` exists for the active scope, prepend a 1.5s still clip generated via the existing `imageToClip` helper (already used elsewhere). This becomes frame 0 of the final film.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx` — button, state, dialog routing, Pending render, merge prepend.
- No changes needed to `AiImageDialog.tsx`, edge functions, or DB.

## Verification
1. Click Camera icon → dialog opens with aspect ratio prefilled.
2. Generate image → it appears as a single `COVER` card at the top of Pending; does NOT appear as a normal source image; does NOT get staged into the Start slot.
3. Click Camera again → new cover replaces the old one.
4. Trigger Final Film → first 1.5s of merged video is the cover still, followed by clips in current order.
5. Switch between drafts/projects → cover follows the active scope.

## Open question (assumed default, override if wrong)
- Should the cover automatically be included as the first frame of the final merged video? **Assumed: yes, 1.5s still.** If you'd rather have it as a pure visual badge only (no merge inclusion), say so and I'll drop step 5.
