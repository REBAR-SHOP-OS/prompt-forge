# Read-only audit: Rebar.Shop 12–15s vertical social edit

Scope: this is an audit only. No code, database, storage or publish changes. Every candidate below comes from reading the database. I have not watched any of these clips frame by frame.

## 1) Intro
- I found no completed intro or logo-reveal job in Sattar's or Radin's library.
- Best existing treatment: the bundled style preview `src/assets/style-previews/vid-logo-reveal.mp4` (an asset pointer). It is a demo preview, not a Rebar.Shop master, so it should only guide a look. Recommended intro: a 2s Brand Book logo card drawn as an overlay (`generator_clip_overlays`, kind image plus text) on top of the first body clip, not a separate clip.

## 2) Body clips (all from Radin, 9:16, Wan)
- Product / fabrication: job `1d6419d7-9aa4-410c-a585-4313daa594fd`, asset `0c3dc5c8-4af8-4b7b-a60d-b4aefb1b6a86`, `merged-videos/55779da2-.../job-994d0afc-2b78-4189-98e0-c321e9c3ccf9.mp4` (macro dolly on a ribbed stirrup, cranes behind).
- Construction / install: job `90bdb815-f133-4304-a61a-d50d272669f1`, asset `ec68f177-4d10-4d90-8128-2202d552cb7b`, `merged-videos/55779da2-.../job-5cc4edc5-bc81-462a-9994-624701cafee6.mp4` (orbit around a column while workers secure stirrups).
- Product hero (alternate): job `79119e6b-d58f-43dc-bdfc-24c75f9bc57a`, asset `0cac7a3e-479f-41c3-b45e-d8e372236687`, `.../job-0255b40c-9f77-4d6d-b8fe-c92c187e4e2a.mp4` (5s, Rebar Stirrup with the product identity lock).
- Delivery: I found no completed delivery or truck job. This is a gap. Either generate one 5s delivery clip or cover it with a text overlay ("Delivered to site").
- These are 15s clips. Trim each to about 3.5–4s.

## 3) Outro
- I found no existing outro clip. Use the existing contact-overlay feature, which reads from `generator_business_profiles`: the contact_logo_url, contact_website and contact_phone fields. I have not checked the values stored there yet.
- Hard requirement: the text must be `rebar.shop/request-a-quote` and `(647) 260-9403`, drawn as overlay text, never as text generated into the video. Hold it for 2.5–3s on a dark Brand Book card or on a darkened last frame.

## 4) Transitions (current merge engine)
- IDs: `cut`, `fade`, `crossfade`, `slide-left`, `slide-right`, `wipe`, `zoom`.
- Duration range: 200–1000 ms. Presets: Fast 300, Normal 500, Smooth 800. Cut is always 0.
- Recommended 14s sequence:

```text
0.0-2.0  Intro logo card over clip A        -> zoom 400ms
2.0-5.5  A: stirrup macro (1d6419d7)        -> crossfade 300ms
5.5-9.0  B: column orbit (90bdb815)         -> slide-left 300ms
9.0-11.5 C: delivery (missing; generate)    -> fade 500ms
11.5-14  Outro card: logo, URL, phone
```

## 5) Real vs generated, and risks
- Every job candidate uses the `wan` provider, so all of it is AI-generated or illustrative. None of it is verified real footage. The bundled style previews are generated demo assets too.
- The `user-images` uploads (such as `e5fc1197...`, 651x869 jpeg) and the 1152x2048 jpgs could be real photos, but nothing marks where they came from. Treat them as unverified.
- Geometry risk: AI-made rebar shows bent hooks, uneven rib spacing, merged bars and stirrups with impossible closure. Check every frame before use.
- Text and brand risk: generated video can show fake or garbled signs or logos. Keep all brand text in overlays only, and use the official logo file from the Brand Book.
- Some job prompts are in Persian or run up to 30s. Confirm a clip's real length before trimming.
- One asset (`f6798f23...`) stores a full public URL instead of a storage path, which is not consistent with the others.

## Next steps (if approved, still read-only)
- Read the stored business profile contact values.
- Pull still frames from the 3 body clips to check geometry and look for fake text.

## Addendum: can MCP or API routes reach Radin's media without a browser login? (read-only findings)

1) **Listing and signed links**
- The MCP server `prompt-forge-mcp` (the `mcp` function) has 4 tools, all read-only: `list_jobs`, `get_job`, `list_videos`, `get_credit_balance`. Callers must sign in through OAuth (issuer `https://<ref>.supabase.co/auth/v1`, audience `authenticated`).
- `list_videos` has no "shared" option. It does not filter by owner itself, so the library-sharing rules decide what comes back: Sattar's token returns his rows plus Radin's. It returns storage paths and thumbnail URLs only. **No MCP tool creates signed links.**
- `GET /videos-list?shared=1&limit=N` (needs a user session token) lists shared videos the same way. It also returns paths only, not signed links.
- `video-proxy` checks that the caller is signed in, then streams the file. I have not yet confirmed whether it also checks who owns the file. Treat it as unverified, not as an approved way to fetch the files.
- Limitation: no supported route returns temporary signed links for `user-videos` files. Note that Radin's merged-video paths sit in `merged-videos` (some stored as full public URLs), not in `user-videos`.

2) **Remix or merge**
- No MCP tool can create a merged or remix video. Merging (the Final Film) runs only inside the browser, which is the WebCodecs path. The closest server-side calls are `jobs-create` (new clips, which spend credits) and `jobs-update-edited-video` (owner-only). Neither one merges videos.

3) **Safest next step**
- Add one read-only MCP tool, `get_shared_video_url`, built on OAuth. It would call the existing `can_view_owner` check, then issue a short-lived (for example 10 minute) signed link for the requested video asset.
- Keep merging in the app. A server-side merge tool would need a new rendering setup, and that would break the rule against reintroducing ffmpeg.wasm in the merge path, so it is not recommended.
- Note on auth: OAuth on the backend has to be switched on and the app republished before any outside caller can use the MCP server. I have not checked whether OAuth is on.
