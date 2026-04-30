# Remove signup link from login page

Hide the "No account? Sign up" link circled in the screenshot. Signup will still work via direct URL (`/signup`) and the `/signup` route stays intact — only the public entry point from the login screen is removed.

## Change

**File:** `src/components/auth/AuthForm.tsx`

Replace the bottom paragraph (currently shows "No account? Sign up" in login mode and "Already have one? Sign in" in signup mode) so the link only renders in signup mode:

```tsx
{mode === "signup" && (
  <p className="text-center text-sm text-muted-foreground">
    Already have one? <Link to="/login" className="text-foreground underline">Sign in</Link>
  </p>
)}
```

## Result

- Login page: no signup link visible.
- Signup page (`/signup`): unchanged, still shows "Already have one? Sign in".
- Routes, auth flow, RLS, and protected routes untouched.
