## هدف

وقتی یک کاربر برای **اولین بار** با موفقیت sign in می‌کند، یک ویدئوی معرفی (موشن گرافیک آپلود شده) به‌صورت تمام‌صفحه/مودال نمایش داده شود. در دفعات بعدی این ویدئو نشان داده نشود و کاربر مستقیم وارد Dashboard شود.

## رویکرد (ساده و بدون نیاز به تغییر دیتابیس)

تشخیص "اولین بار" روی همان مرورگر با استفاده از `localStorage` به ازای هر `user.id`. این روش:
- بدون migration و بدون فیلد جدید در DB
- فوری کار می‌کند
- دقیقاً چیزی که برای UX اولیه لازم است را پوشش می‌دهد

(در آینده اگر خواستید "اولین بار" به ازای کاربر در همه دستگاه‌ها معتبر باشد، می‌توان فیلد `onboarded_at` به profile اضافه کرد — خارج از scope این درخواست.)

## تغییرات

### ۱) قرار دادن ویدئو در پروژه
کپی فایل آپلود شده به:
```
public/intro/welcome.mp4
```
(پوشه `public` چون به‌صورت مستقیم با `<video src="/intro/welcome.mp4">` پخش می‌شود.)

### ۲) کامپوننت جدید `WelcomeVideoOverlay`
مسیر: `src/modules/generator-ui/components/WelcomeVideoOverlay.tsx`

- یک overlay تمام‌صفحه با پس‌زمینه تیره
- تگ `<video>` با `autoPlay`, `playsInline`, `controls`
- دکمه **Skip / رد کردن** بالا-راست
- وقتی ویدئو تمام شد یا Skip زده شد → `onClose()` صدا زده می‌شود

### ۳) اتصال در `DashboardPage`
در `src/modules/generator-ui/pages/DashboardPage.tsx`:
- خواندن `user` از `useAuth()`
- در `useEffect`: اگر `localStorage.getItem('welcome_seen_' + user.id)` خالی بود → `showWelcome=true`
- بعد از بستن overlay: `localStorage.setItem('welcome_seen_' + user.id, '1')`

```tsx
const { user } = useAuth()
const [showWelcome, setShowWelcome] = useState(false)

useEffect(() => {
  if (!user) return
  const key = `welcome_seen_${user.id}`
  if (!localStorage.getItem(key)) setShowWelcome(true)
}, [user])

const dismiss = () => {
  if (user) localStorage.setItem(`welcome_seen_${user.id}`, '1')
  setShowWelcome(false)
}

return (
  <>
    {showWelcome && <WelcomeVideoOverlay onClose={dismiss} />}
    {/* ... باقی Dashboard */}
  </>
)
```

## نتیجه

- اولین sign in یک کاربر جدید → ویدئوی welcome به‌طور خودکار پخش می‌شود.
- پایان ویدئو یا کلیک Skip → overlay بسته و وارد Dashboard می‌شود.
- ورودهای بعدی همان کاربر در همان مرورگر → بدون ویدئو، مستقیم Dashboard.
- بدون تغییر دیتابیس، بدون ریسک شکستن چیزی.

## فایل‌های تحت تغییر
- `public/intro/welcome.mp4` (جدید — کپی از فایل آپلود شده)
- `src/modules/generator-ui/components/WelcomeVideoOverlay.tsx` (جدید)
- `src/modules/generator-ui/pages/DashboardPage.tsx` (افزودن state و overlay)
