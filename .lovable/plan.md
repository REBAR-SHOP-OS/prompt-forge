## دو تغییر کوچک

### 1) جلوگیری از پخش خودکار هنگام جلو/عقب کردن روی Waveform
فایل: `src/modules/generator-ui/components/SoundtrackWaveform.tsx` — خطوط 110–116.

علت: در `handleInteraction` بعد از scrub، `ws.play()` فراخوانی می‌شود.

پس از تغییر:
```ts
const handleInteraction = () => {
  setCurrentTime(ws.getCurrentTime())
  // فقط موقعیت را به‌روز کن؛ پخش با دکمه Play توسط کاربر انجام می‌شود.
  stopAtRef.current = null
}
```

### 2) تغییر رنگ کل باکس دیالوگ Soundtrack از سرمه‌ای به مشکی
فایل: `src/modules/generator-ui/pages/DashboardPage.tsx` — خط 1735.

پس از تغییر:
```tsx
<DialogContent className="border-white/10 bg-black text-zinc-100 sm:max-w-md">
```

## چرا امن است
- هیچ منطق دیگری تغییر نمی‌کند.
- `playSelection`، `togglePlay` و `playRange` همچنان کار می‌کنند چون مستقل از `handleInteraction` هستند.
- override رنگ فقط روی همین Dialog اعمال می‌شود؛ بقیه دیالوگ‌های پروژه دست‌نخورده می‌مانند.