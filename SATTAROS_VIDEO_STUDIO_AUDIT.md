# SattarOS — Video Studio Integration Audit

> Audit of the existing **Video Studio** (codename: *aura-clip-studio* / generator-ui) module and a recommendation for how it becomes part of **SattarOS**.
> Scope: assessment only. **No new video application was built.** This report maps what exists today, classifies it against SattarOS business domains, and proposes integration, AI roadmap, and strategy.

---

## Executive Summary

Video Studio is a **mature, single-page AI video generation & editing studio** built on React 18 + Vite + Supabase (Lovable Cloud). It is feature-rich for **content creation** (text/image → video, voiceover, soundtrack, trimming, merging into a "Final Film", copyright check, social export) but it has **zero domain awareness of rebar/construction operations** today. There is no jobsite analysis, no ERP/CRM linkage, and no role/project context beyond per-user ownership.

**Verdict:** Video Studio should become a **SattarOS module** (a shared media+AI service), **not** a standalone product. Its generation pipeline is reusable; its missing half is the *operational intelligence* layer (jobsite analysis, rebar verification, ERP/CRM events).

- **Content-creation core:** ~85% complete, ~70% production-ready.
- **Operational/AI-intelligence layer for SattarOS:** ~5% complete (analysis primitives exist, no domain logic).
- **Highest-value next step:** ship a thin **"Project Update Video → AI Analysis → ERP/CRM event"** vertical slice reusing the existing upload + `video-analyze` pipeline.

---

## Part 1 — Current State

### 1.1 Architecture at a glance

- **Framework:** React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, HashRouter.
- **Auth:** Supabase auth via `AuthProvider`; gated single dashboard (`App.tsx` → `Gate` → `LibrarySyncGate` → `DashboardPage`).
- **Backend:** Supabase Edge Functions (Deno) + Postgres with RLS + security-definer RPCs.
- **AI providers:** Lovable AI Gateway (`LOVABLE_API_KEY`), Gemini (`GEMINI_API_KEY`), a WAN video provider (`WAN_API_KEY`), and a self-hosted Local LLM / RTX node over SSH (`LOCAL_LLM_*`, `SYNOLOGY_SSH_*`).

### 1.2 Pages

| Page | Status | Completion | Prod-Ready | Dependencies |
|---|---|---|---|---|
| `DashboardPage.tsx` (the entire app — ~10,300 lines) | Active | 90% | 65% | Auth, all gateways, all edge functions, storage |
| `LoginPage.tsx` | Active | 95% | 90% | `AuthProvider`, Supabase auth |

> **Risk:** the studio is a single 10k-line page. This is the #1 maintainability and performance liability (re-render storms, the recurring "studio slow in iframe" issue). Decomposition is a prerequisite for safe SattarOS embedding.

### 1.3 Components (`src/modules/generator-ui/components`)

| Component | Purpose | Status | Completion | Prod-Ready |
|---|---|---|---|---|
| `PlayableVideo.tsx` | Signed-URL video player | Active | 85% | 60% (reload-loop history) |
| `SequentialClipPlayer.tsx` | Final-film sequential playback | Active | 80% | 70% |
| `VideoWithSoundtrack.tsx` / `PreviewSoundtrackWaveforms.tsx` / `SoundtrackWaveform.tsx` | Audio mixing + waveform UI | Active | 80% | 70% |
| `ClipTrimmerDialog.tsx` | In-browser trim (ffmpeg/wasm via `trimVideo.ts`) | Active | 85% | 70% |
| `VoiceoverDialog.tsx` | TTS voiceover | Active | 80% | 70% |
| `ScenarioWriterDialog.tsx` | AI scenario/treatment writer | Active | 85% | 75% |
| `ProductAdDialog.tsx` | Product-ad prompt builder | Active | 80% | 70% |
| `AiImageDialog.tsx` / `ImageReframeDialog.tsx` | AI image gen/edit + reframe | Active | 80% | 70% |
| `VideoToVideoDialog.tsx` | V2V edit (uses `video-analyze`) | Active | 75% | 60% |
| `StylePreviewCard.tsx` / `TransitionPreview.tsx` | Style/transition gallery | Active | 90% | 85% |
| `UsageStatsPopover.tsx` | Credits/usage display | Active | 90% | 85% |
| `CalendarInfoDialog.tsx` | Occasion/calendar prompts (`day-info`) | Active | 80% | 75% |
| `WelcomeVideoOverlay.tsx` / `LibrarySyncGate.tsx` | Onboarding + library hydration | Active | 85% | 80% |

### 1.4 Libraries (`src/modules/generator-ui/lib`)

`mergeVideos.ts`, `trimVideo.ts`, `transcodeToMp4.ts`, `imageToClip.ts`, `normalizeImageAspect.ts`, `proxiedVideoUrl.ts`, `usePlayableVideoUrl.ts`, `promptStyles.ts`, `majorOccasions.ts`, `libraryState.ts` — client-side media processing (ffmpeg.wasm class) + prompt presets. **Status: active, ~80% complete, ~70% prod-ready.** Heavy CPU work in-browser is a perf concern for embedded/iframe use.

### 1.5 Routes

Single client route (`/index` under HashRouter). No deep-linkable feature routes, no nested router. **Completion 100% for what it is; 30% suitable for SattarOS** (needs routable, embeddable sub-views).

### 1.6 Edge Functions

| Function | Purpose | Category | Completion | Prod-Ready | Deps |
|---|---|---|---|---|---|
| `jobs-create` | Start a generation job (RPC `generator_start_job`) | Core | 90% | 80% | quotas, credits, provider |
| `jobs-create-from-upload` | Register user-uploaded video as a completed job | Core | 90% | 80% | storage |
| `jobs-get` / `jobs-list` / `jobs-delete` | Job lifecycle | Core | 90% | 85% | RLS |
| `jobs-update-edited-video` | Persist edited/merged output | Core | 85% | 75% | storage |
| `videos-list` | List video assets | Core | 90% | 85% | RLS |
| `video-proxy` | Signed/proxied video streaming | Core | 85% | 75% | storage |
| `ai-image-generate` / `ai-image-edit` | AI images | AI | 85% | 75% | AI Gateway |
| `image-reframe` | Aspect reframing | AI | 80% | 70% | AI Gateway |
| `enhance-prompt` | Cinematic prompt rewrite (multilingual) | AI | 90% | 80% | AI Gateway |
| `scenario-write` | Idea → scene treatment(s) | AI | 90% | 80% | AI Gateway |
| `tts-generate` | Gemini TTS voiceover | AI | 85% | 75% | Gemini |
| `video-analyze` | **Gemini multimodal scene analysis** | AI/Intelligence | 70% | 55% | Gemini, 25MB cap |
| `copyright-check` | Copyright/rights risk verdict | AI/Compliance | 75% | 65% | Gemini |
| `local-llm-plan-video` | Self-hosted LLM planner (RTX node) | AI | 60% | 45% | SSH/local LLM |
| `day-info` | Calendar/occasion data | Support | 80% | 80% | — |
| `me` / `usage-credits` | Profile + credits | Support | 90% | 85% | RLS |
| `repair-provider-videos` | Maintenance/backfill | Ops | 70% | 60% | provider |
| `health` | Health check | Ops | 95% | 95% | — |
| `ai-gateway-route-preview` | Routing preview | Ops | 70% | 60% | — |

### 1.7 Database Tables (public schema, RLS-enforced)

| Table | Purpose | Completion | Prod-Ready |
|---|---|---|---|
| `core_user_profiles` | User profile + `credits_balance` | 95% | 90% |
| `user_roles` (`app_role` enum + `has_role`) | RBAC (admin/moderator/user) | 95% | 90% |
| `generator_generation_jobs` | Job records (incl. `final-film`, `draft_group_id`, `parent_final_job_id`) | 90% | 80% |
| `generator_video_assets` | Output video assets | 90% | 80% |
| `generator_user_images` | Uploaded/AI images (incl. `category: 'product'`) | 90% | 80% |
| `generator_user_audio` | Voiceover/soundtrack | 85% | 75% |
| `generator_clip_overlays` | Per-clip overlays/text | 80% | 70% |
| `generator_library_state` | Library/UI persistence | 85% | 80% |
| `billing_user_quotas` / `billing_credit_transactions` | Quota + credit ledger | 90% | 85% |
| `core_ai_provider_registry` | Provider registry | 80% | 75% |
| `audit_api_request_logs` / `audit_audit_logs` | Cost + audit logging | 85% | 80% |

> **Gap for SattarOS:** there is **no project / job-order / customer / asset-type table**. All data is keyed to `user_id` only. Operational linkage (project_id, customer_id, erp_ref) does not exist.

### 1.8 Storage Buckets

| Bucket | Public | Use |
|---|---|---|
| `user-images` | Yes | Source/product images |
| `wan-frames` | Yes | Provider frame I/O |
| `user-videos` | No | Uploaded/source videos |
| `merged-videos` | No | Final films |
| `user-audio` | No | Voiceover/soundtrack |
| `overlay-assets` | No | Overlays |

**Completion 90%, prod-ready 80%.** Public image buckets are acceptable for marketing but **must not** hold confidential jobsite/customer footage — SattarOS will need a private, project-scoped bucket policy.

### 1.9 Integrations

- **AI:** Lovable AI Gateway, Gemini (analysis/TTS), WAN video provider, self-hosted Local LLM (RTX over SSH/Synology).
- **External operational systems (ERP/CRM/Portal/Shop Floor):** **none.** This is the central integration gap.
- **Social media:** a "Send to Social Media Manager" `postMessage` bridge to a parent host (Rebar OS iframe) exists but is **debug/unstable** (origin/targetOrigin issues under preview).

### 1.10 AI Features (summary)

Prompt enhancement, scenario writing, image gen/edit/reframe, TTS voiceover, **video scene analysis**, copyright check, local-LLM planning. These are **creation/compliance** AI features — analysis exists but is used to *improve edits*, not to *measure jobsite reality*.

### 1.11 Export Features

Client-side trim/transcode to standard MP4 (`trimVideo.ts`, `transcodeToMp4.ts`), multi-clip merge → **Final Film** (`mergeVideos.ts` + `generator_finalize_film` RPC), soundtrack/voiceover mux, overlays, direct download, and the `postMessage` "send to social" bridge. **Completion ~80%, prod-ready ~65%** (in-browser ffmpeg perf + the social bridge are the weak points).

---

## Part 2 — Business Purpose Mapping (Video Studio → SattarOS)

| SattarOS Domain | Sub-use | Supported today by | Coverage |
|---|---|---|---|
| **Marketing** | Social content | scenario-write, product-ad, styles, social bridge | ✅ ~80% |
| | Product videos | ProductAdDialog, product images, V2V | ✅ ~75% |
| | SEO videos | prompt styles, scenario-write | 🟡 ~50% (no SEO metadata pipeline) |
| | Campaign videos | occasions/`day-info`, scenario-write | 🟡 ~55% |
| **Training** | Employee onboarding | generation + voiceover + Final Film | 🟡 ~40% (no curriculum/structure) |
| | SOP videos | same primitives | 🟡 ~35% |
| | Safety videos | same primitives | 🟡 ~35% |
| | Equipment training | same primitives | 🟡 ~30% |
| **Operations** | Daily reports | upload + (future) analysis | 🔴 ~10% |
| | Progress videos | upload + analysis primitive | 🔴 ~10% |
| | Project updates | upload + Final Film | 🔴 ~15% (no project linkage) |
| | Customer communications | export + social bridge | 🔴 ~15% |
| **AI Intelligence** | Video analysis | `video-analyze` (generic Gemini) | 🟡 ~30% |
| | Object detection | none (Gemini could, untuned) | 🔴 ~5% |
| | Rebar recognition | none | 🔴 0% |
| | Progress tracking | none | 🔴 0% |
| | Quality control | `copyright-check` only (content, not QC) | 🔴 ~5% |

**Read:** Video Studio is **strong on Marketing**, **usable-with-effort on Training**, and **largely absent on Operations & operational AI Intelligence** — which is exactly where SattarOS creates differentiated value.

---

## Part 3 — Integration Opportunities

Video Studio should expose two contracts to SattarOS: an **inbound** "create media for entity X" API and an **outbound** "media analyzed → emit event" API. Both must carry `project_id` / `customer_id` / `erp_ref` context that does not exist today.

| SattarOS System | How Video Studio connects | Direction |
|---|---|---|
| **Rebar ERP** | Attach generated/uploaded videos to job orders; analysis writes progress % back to ERP | Bi-directional |
| **CRM** | Auto-generate customer update videos from project state; log sends as CRM activities | Outbound + activity log |
| **Customer Portal** | Publish project-update / progress videos to the portal feed (private signed URLs) | Outbound |
| **Shop Floor** | Capture station/equipment clips → SOP/training library; QC clips → analysis | Inbound + analysis |
| **Production** | Progress videos tied to production milestones; rebar-install verification | Bi-directional |
| **Logistics** | Delivery/load videos as proof-of-condition attached to shipments | Inbound |
| **Project Coordination** | Timeline entries auto-created from analyzed jobsite videos | Outbound |
| **SattarOS Command Center** | Central dashboard of media + AI insights, cost, and pending reviews | Outbound (telemetry) |

**Reference flow (target):**

```text
Jobsite / Project Update Video (upload or capture)
        ↓
AI Analysis (rebar recognition + progress % + QC flags)
        ↓
ERP Update (job-order progress, milestone, exceptions)
        ↓
CRM / Customer Notification (auto customer-update video + portal post)
        ↓
Project Timeline (Command Center entry + audit log)
```

Today only the first node is real; nodes 2–5 require the operational schema + event bus described in Part 4/5.

---

## Part 4 — Future AI Features (readiness, effort, architecture)

Effort scale: **S** ≈ 1–2 wks, **M** ≈ 3–6 wks, **L** ≈ 2–4 mo, **XL** ≈ 4 mo+. Readiness = how much existing scaffolding helps.

| Capability | Readiness | Effort | Architecture recommendation |
|---|---|---|---|
| **Jobsite video analysis** | Medium (Gemini path exists) | M | Extend `video-analyze` into `jobsite-analyze` with a rebar-domain prompt + structured schema; chunk >25MB via storage streaming, not inline base64. |
| **Rebar installation verification** | Low | L | Fine-tuned/vision model (Gemini Pro Vision or a custom detector on the RTX node) comparing as-built vs. barlist/blueprint; needs labeled rebar dataset. |
| **Progress percentage detection** | Low | L | Combine detection output with ERP barlist quantities → % = installed/total; deterministic math layer on top of vision. |
| **AI-generated daily reports** | Medium (LLM + analysis) | M | Aggregate day's analyzed clips → `scenario-write`-style report generator → PDF/video; emit to Command Center. |
| **AI-generated customer updates** | Medium | M | Template + project state + Final Film pipeline; gated by human approval before CRM send. |
| **AI-generated training videos** | Medium | M | Curriculum schema + SOP templates over existing generation/voiceover/merge stack. |
| **AI-generated marketing videos** | High (mostly exists) | S | Productize existing scenario→generate→merge→export with brand presets. |
| **Glasses / XR integration** | Low | XL | Ingest endpoint for wearable streams; same analysis backend; real-time is a separate streaming architecture. |
| **Drone footage analysis** | Low–Medium | L | Large-file ingest (chunked storage), geo/temporal stitching, then jobsite-analyze; orthomosaic out of scope initially. |

**Cross-cutting architecture recommendations:**
1. **Decompose `DashboardPage.tsx`** into routable, lazy-loaded feature modules before embedding in SattarOS (fixes the iframe slowness and re-render storms).
2. **Move heavy media processing server-side** (a worker/queue or the RTX node) instead of in-browser ffmpeg.wasm for operational footage.
3. **Add an operational schema**: `projects`, `project_media`, `media_analysis`, `media_events` with `project_id`/`customer_id`/`erp_ref` and strict RLS + role scoping.
4. **Introduce an event bus / webhook contract** so analysis results fan out to ERP/CRM/Portal deterministically (with human approval gates for customer-facing outputs).
5. **Private, project-scoped storage** for jobsite/customer footage — never the public buckets.

---

## Part 5 — SattarOS Strategy

**1. Standalone product or SattarOS module?**
→ **SattarOS module** — a shared *Media & Video Intelligence* service. The generation pipeline is reusable infrastructure; its value multiplies only when wired to ERP/CRM/Portal data. Keep a thin "Marketing Studio" UI as the standalone-feeling surface, but the engine is a module.

**2. Which SattarOS modules should consume Video Studio data?**
→ ERP (progress %, attachments), CRM (customer updates), Customer Portal (project feed), Production & Project Coordination (timelines/milestones), Shop Floor/Training (SOP & safety library), and the Command Center (telemetry, cost, review queue).

**3. Which AI agents should use Video Studio?**
→ a **Jobsite Analysis agent** (rebar recognition + progress), a **Reporting agent** (daily reports/customer updates), a **Marketing/Content agent** (campaigns), a **Training/SOP agent**, and a **QC/Compliance agent** (extends `copyright-check` + QC flags). All share the analysis + generation backend.

**4. Competitive advantage created?**
→ A closed loop **"capture → AI-verify → ERP/CRM/customer"** specialized for rebar/construction. Competitors do generic video tools or generic AI; SattarOS uniquely ties **rebar-aware vision** to **operational systems of record**, turning everyday jobsite footage into verified progress, automated customer trust, and a reusable training/marketing asset library.

**5. Highest-value next step?**
→ Ship one **vertical slice**: **Project Update Video → `jobsite-analyze` (progress + QC) → ERP progress event → approved customer-update post to Portal/CRM.** It reuses the existing upload + analysis + Final Film + social-bridge plumbing, forces the operational schema/event contract into existence, and proves the differentiated loop end-to-end before investing in rebar-specific vision (the L/XL items).

---

## Appendix — Top Risks / Tech Debt

1. **Monolith page** (`DashboardPage.tsx`, ~10.3k lines) — maintainability, re-render/perf, iframe slowness.
2. **No operational data model** — everything is `user_id`-scoped; no project/customer/ERP linkage.
3. **In-browser ffmpeg.wasm** for trim/merge — not viable for large operational footage.
4. **`video-analyze` 25MB inline cap** — blocks real jobsite/drone files; needs chunked/streamed ingest.
5. **Social `postMessage` bridge** — origin/targetOrigin fragility under preview/iframe; harden before production.
6. **Public image buckets** — unsafe for confidential customer/jobsite media.
7. **Local LLM / RTX node over SSH** — operationally fragile dependency; add health/fallback.
