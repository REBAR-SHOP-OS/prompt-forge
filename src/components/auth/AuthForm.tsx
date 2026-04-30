import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  mode: "login" | "signup";
}

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});

export default function AuthForm({ mode }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setNeedsConfirm(false);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        // If no session was returned, email confirmation is required.
        if (!data.session) {
          setNeedsConfirm(true);
          setInfo(
            "Account created. Please check your inbox to verify your email before signing in. / حساب ساخته شد. لطفاً برای فعال‌سازی، ایمیل خود را بررسی کنید.",
          );
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) {
          if (/confirm/i.test(error.message)) {
            setNeedsConfirm(true);
          }
          throw error;
        }
      }
      navigate("/app", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setInfo(null);
    const parsed = schema.shape.email.safeParse(email);
    if (!parsed.success) {
      setError("Enter your email to resend confirmation.");
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: parsed.data,
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });
      if (error) throw error;
      setInfo(
        "Confirmation email sent. / ایمیل تأیید ارسال شد.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </Button>
      {needsConfirm && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onResend}
          disabled={resending}
        >
          {resending ? "Sending…" : "Resend confirmation email / ارسال مجدد ایمیل تأیید"}
        </Button>
      )}
      {mode === "signup" && (
        <p className="text-center text-sm text-muted-foreground">
          Already have one? <Link to="/login" className="text-foreground underline">Sign in</Link>
        </p>
      )}
    </form>
  );
}
