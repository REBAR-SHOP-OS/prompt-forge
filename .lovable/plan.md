## هدف
اضافه‌کردن یک آیکون «آپلود ویدیو» در همان نوار بالایی (در ردیف Start Over / Final Film / Music / Voiceover). با کلیک روی آن، file picker باز شود؛ پس از انتخاب ویدیو، یک کارت ویدیویی *واقعی* و ماندگار در History ساخته شود — دقیقاً با همان منطق و قابلیت‌های کارت‌های ویدیوی تولیدشده (Trim/Apply Changes، Delete، Drag/ordering، Transitions، Approve، استفاده در Final Film، اپلود سرور، بقا پس از refresh).

## استراتژی
کارت‌های ویدیو در پروژه از طریق سه جزء «واقعی» می‌شوند:
1. ردیف در `generator_generation_jobs` (با `generator_start_job` RPC)
2. ردیف asset در `generator_video_assets` (با `generator_complete_job` RPC)
3. آپلود فایل در یک bucket عمومی

برای آن‌که آیکون آپلود همین رفتار را تولید کند، یک edge function جدید + یک متد جدید روی gateway اضافه می‌کنیم که هر سه مرحله را به‌صورت سرور-authoritative انجام دهد. کلاینت خود فایل را به storage آپلود می‌کند و سپس edge function را با `storagePath` فراخوانی می‌کند تا ردیف‌های DB را بسازد. با این روش، کارتِ نهایی از همان مسیر `jobOrchestratorGateway.listMyJobs/getJob` می‌آید و بدون هیچ تغییر دیگری همهٔ ویژگی‌های موجود (trim، delete، drag، transition، merge، approve، persist) را به ارث می‌برد.

## تغییرات

### ۱) Bucket عمومی برای ویدیوهای آپلودی
Migration:
```sql
insert into storage.buckets (id, name, public)
values ('user-videos', 'user-videos', true)
on conflict (id) do nothing;

-- RLS: هر کاربر فقط در پوشهٔ user_id خودش بنویسد/پاک کند؛ خواندن عمومی است.
create policy "user-videos read" on storage.objects
  for select using (bucket_id = 'user-videos');
create policy "user-videos write own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user-videos delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-videos' and (storage.foldername(name))[1] = auth.uid()::text);
```

### ۲) Edge function جدید: `supabase/functions/jobs-create-from-upload/index.ts`
ورودی: `{ storagePath: string, durationSeconds?: number, aspectRatio?: '16:9'|'1:1'|'9:16', prompt?: string }`.
عملکرد:
1. احراز هویت کاربر (مثل بقیهٔ توابع).
2. صدا زدن `generator_start_job(_user_id, _prompt='Uploaded video', _provider_key='upload', _model_key='user-upload', _cost=0)` → `jobId`.
3. مارک‌کردن «processing» (اختیاری، ممکن است لازم نباشد).
4. صدا زدن `generator_complete_job(_user_id, _job_id, _storage_path=publicUrl, _thumbnail_url=null, _aspect_ratio, _duration)` → asset ساخته می‌شود و وضعیت job → completed.
5. برگرداندن `JobDetail` کامل (مثل `jobs-get`) تا کلاینت آن را در state درج کند.

### ۳) متد جدید gateway در `src/modules/job-orchestrator/gateway.ts`
```ts
createUploadedVideoJob: (input: { storagePath: string; durationSeconds: number; aspectRatio: 'wide'|'square'|'tall'|'16:9'|'1:1'|'9:16' })
  => request<JobDetail>('/jobs-create-from-upload', { method: 'POST', body: JSON.stringify(input) })
```

### ۴) UI در `DashboardPage.tsx`
درست بعد از دکمهٔ «Start Over» (یا قبل از «Final Film»، در همان wrapper نوار بالا — جایی که کاربر در اسکرین‌شات مشخص کرده) موارد زیر اضافه شود:
- یک `<input type="file" accept="video/*" hidden ref={uploadVideoInputRef} onChange={handleUploadVideoFile} />`
- یک دکمه:
  ```tsx
  <button
    type="button"
    onClick={() => uploadVideoInputRef.current?.click()}
    disabled={isUploadingVideo}
    aria-label="Upload a video file as a new card"
    title="Upload a video file (mp4, webm) as a new card"
    className="flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-sky-300/30 hover:bg-sky-300/[0.06] hover:text-sky-100 disabled:opacity-40"
  >
    {isUploadingVideo
      ? <><LoaderCircle className="h-[14px] w-[14px] animate-spin" /><span>{uploadVideoProgress}%</span></>
      : <><Upload className="h-[14px] w-[14px]" /><span>Upload</span></>}
  </button>
  ```

### ۵) Handler آپلود
تابع `handleUploadVideoFile(e)`:
1. اعتبارسنجی: `file.type.startsWith('video/')`، حجم حداکثر (مثلاً ۲۰۰MB)، userId موجود.
2. استخراج `duration` و `aspect_ratio` با `<video>` المنت پنهان (`videoWidth/videoHeight` → نگاشت به `'9:16' | '1:1' | '16:9'` با همان منطق `pickRatioFromDims` یا fallback به `aspectRatio` فعلی).
3. `setIsUploadingVideo(true)`؛ آپلود به `user-videos` در مسیر `${userId}/upload-${Date.now()}-${crypto.randomUUID()}.${ext}` با `supabase.storage.from('user-videos').upload(...)`.
4. گرفتن `publicUrl`.
5. صدا زدن `jobOrchestratorGateway.createUploadedVideoJob({ storagePath: publicUrl, durationSeconds, aspectRatio })`.
6. `setGeneratedVideos(prev => mergeJob(prev, returnedJob))` — کارت بلافاصله در History ظاهر می‌شود و چون از همان pipeline می‌آید، Trim/Delete/Drag/Transition/Approve/Final Film همگی بدون هیچ کار اضافه‌ای کار خواهند کرد.
7. در صورت خطا: roll-back با `supabase.storage.from('user-videos').remove([path])` + پیام در `videoColumnMessage`.
8. `setIsUploadingVideo(false)` و `e.target.value = ''` تا انتخاب همان فایل دوباره ممکن باشد.

### ۶) جزئیات سازگاری
- `deleteCard` همان مسیر `jobOrchestratorGateway.deleteJob` را می‌رود؛ چون asset در DB ثبت شده و `storage_path` به `user-videos` اشاره دارد، تابع `generator_delete_job` فقط رکورد را soft-delete می‌کند. برای پاکسازی فایل storage، در همان شاخهٔ موجودِ `deleteCard` (که در حال حاضر فقط `deleteJob` را صدا می‌زند) نیازی به تغییر نیست — مدل پروژه برای کارت‌های واقعی همین است.
- Apply Changes از قبل کار می‌کند (در پیاده‌سازی قبلی `applyTrimToCard`، `storage_path` کارت در state بروز می‌شود و فایل جدید در `merged-videos` ذخیره می‌شود).
- Final Film هم چون این کارت‌ها در `displayedClips` مثل بقیه ظاهر می‌شوند، خودبه‌خود قابل merge هستند.

## فایل‌های تغییریافته یا جدید
- (جدید) `supabase/migrations/<timestamp>_user_videos_bucket.sql`
- (جدید) `supabase/functions/jobs-create-from-upload/index.ts`
- (جدید) handler در `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` (افزودن operation `createUploadedVideoJob`) — یا یک edge function مستقل که مستقیم RPCها را صدا بزند بدون تغییر gateway مشترک. **رویکرد ترجیحی برای کم‌اثرتربودن:** edge function مستقل که فقط service.completeJob و start_job را با service-role می‌سازد، بدون دست‌زدن به orchestrator gateway مشترک.
- (ویرایش) `src/modules/job-orchestrator/gateway.ts` — افزودن `createUploadedVideoJob`
- (ویرایش) `src/modules/generator-ui/pages/DashboardPage.tsx` — state، input، دکمه، handler

با این تغییرات، آیکون آپلود دقیقاً در همان نقطه قرار می‌گیرد و کارت تولیدشده ۱:۱ مثل کارت‌های ویدیوی Generated رفتار می‌کند.