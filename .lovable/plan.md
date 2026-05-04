## Problem

دکمه Sign out در منو فقط session را پاک می‌کند ولی کاربر در همان صفحه Dashboard باقی می‌ماند (چون در `src/App.tsx` همیشه فقط `<DashboardPage />` رندر می‌شود و هیچ روتری وجود ندارد). نتیجه: یک صفحه شکسته/خالی به جای فرم لاگین.

## Solution

در `src/App.tsx` یک گیت ساده بر اساس session اضافه می‌کنیم که بین `LoginPage` و `DashboardPage` سوییچ می‌کند. هیچ تغییری در منو لازم نیست — همان `signOut()` فعلی کافی است، چون پاک شدن session بلافاصله باعث رندر `LoginPage` می‌شود.

### تغییرات

**`src/App.tsx`** — جایگزینی محتوا با:

```tsx
import { AuthProvider, useAuth } from '@/core/auth/AuthProvider'
import DashboardPage from './modules/generator-ui/pages/DashboardPage'
import LoginPage from './pages/auth/LoginPage'
import LoadingScreen from '@/core/ui/LoadingScreen'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return session ? <DashboardPage /> : <LoginPage />
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
```

## نتیجه

- کلیک روی **Sign out** → session پاک می‌شود → کاربر بلافاصله صفحه لاگین (`LoginPage` با فرم `AuthForm`) را می‌بیند.
- بازگشت به Dashboard پس از لاگین موفق به طور خودکار از طریق همان `onAuthStateChange` در `AuthProvider` انجام می‌شود.
- در حین بارگذاری اولیه session یک LoadingScreen موجود نشان داده می‌شود تا فلش رخ ندهد.