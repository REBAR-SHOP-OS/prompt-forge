// Admin-only section in Account Center: set a team member's password.
// Visibility is a convenience; the server re-checks the admin role.
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/core/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AdminSetPasswordSection() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!user) return
    void supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })
      .then(({ data }) => setIsAdmin(data === true))
  }, [user])

  if (!isAdmin) return null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('admin-set-password', {
      body: { email, password },
    })
    setBusy(false)
    if (error || !data?.ok) {
      let text = data?.error ?? 'Could not update password'
      if (error) try { text = (await (error as { context?: Response })?.context?.json())?.error ?? text } catch { /* ignore */ }
      setMsg({ ok: false, text })
      return
    }
    setPassword('')
    setMsg({ ok: true, text: `Password updated for ${email}` })
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">Admin: set a user's password</h3>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="asp-email" className="text-xs text-muted-foreground">User email</Label>
          <Input id="asp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="asp-password" className="text-xs text-muted-foreground">New password</Label>
          <Input id="asp-password" type="password" autoComplete="new-password" minLength={8} maxLength={72}
            value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {msg && <p className={msg.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>{msg.text}</p>}
        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</Button>
      </form>
    </section>
  )
}
