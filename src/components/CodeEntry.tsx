import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Sign in with the code from the email instead of the link. This works in whichever browser the person
 * is already using, which matters when email apps open links in their own built-in browser.
 */
export function CodeEntry({ email, next = "/calendar" }: { email: string; next?: string }) {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    const token = code.replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(token)) { setErr("Type the number from the email."); return; }
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) { setBusy(false); setErr(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check it, or send a new one." : "Couldn't sign you in: " + error.message); return; }
    await refresh();
    nav(/^\/(?!\/)/.test(next) ? next : "/calendar", { replace: true });
  }

  return (
    <form className="field" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 14 }} onSubmit={submit} noValidate>
      <label htmlFor="otp-code">Link not working in your browser? Type the code from the email instead.</label>
      <div className="row" style={{ alignItems: "stretch", flexWrap: "nowrap" }}>
        <input id="otp-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={12} placeholder="123456" value={code}
          style={{ letterSpacing: ".3em", textAlign: "center", fontSize: 20 }} onChange={e => setCode(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
      </div>
      <div className="err" role="alert">{err}</div>
    </form>
  );
}
