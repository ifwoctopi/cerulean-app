import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { supabase, connected } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { EMAIL_RE } from "@/lib/format";
import { EASE } from "@/components/Motion";
import { ResendLink } from "@/components/ResendLink";

const card = { initial: { opacity: 0, y: 22, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -14, scale: 0.98 }, transition: { duration: 0.4, ease: EASE } };

export default function Login() {
  const [params] = useSearchParams();
  const next = (params.get("next") || "/calendar").replace(/^[a-z]+:|^\/\//i, "");
  const nav = useNavigate();
  const { session, signOut, loading } = useAuth();
  const [email, setEmail] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);

  useEffect(() => { if (session && !loading && params.get("next")) nav(next.startsWith("/") ? next : "/" + next, { replace: true }); }, [session, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returns an error message, or null when the link was sent.
  async function sendLink(addr: string): Promise<string | null> {
    if (!supabase) return "Not connected.";
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + (next.startsWith("/") ? next : "/" + next) } });
    if (!error) return null;
    return /signups? not allowed|not found|disabled/i.test(error.message) ? "There's no account for that email yet. Sign up first, using the link below."
      : /rate|seconds/i.test(error.message) ? "Too many tries. Wait a minute, then send it again." : "Couldn't send the link: " + error.message;
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) { setErr("Enter a full email address."); return; }
    setBusy(true);
    const problem = await sendLink(addr);
    setBusy(false);
    if (problem) { setErr(problem); return; }
    setSent(true);
  }

  return (
    <main className="login-wrap">
      <div className="login-card" style={{ display: "grid", gap: 18 }}>
        <AnimatePresence mode="wait">
          {!connected ? (
            <motion.div key="noconn" className="panel" {...card}>
              <div className="slate">Setup</div><h2>Connect Supabase</h2>
              <p className="muted" style={{ margin: 0 }}>Add <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> to the <code>.env</code> file, then restart <code>npm run dev</code>.</p>
            </motion.div>
          ) : session ? (
            <motion.div key="already" className="panel corner" {...card}>
              <div className="slate">You're in</div><h2>Signed in</h2>
              <p style={{ margin: 0 }}>Signed in as {session.user.email}.</p>
              <div className="actions"><Link className="btn primary" to={next.startsWith("/") ? next : "/" + next}>Continue</Link><button className="btn" type="button" onClick={signOut}>Sign out</button></div>
            </motion.div>
          ) : sent ? (
            <motion.div key="sent" className="panel corner" {...card}>
              <div className="slate">Check your inbox</div><h2>Link sent</h2>
              <p style={{ margin: 0 }}>We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device. It works once and expires in an hour.</p>
              <p className="hint" style={{ margin: 0 }}>Nothing after a few minutes? Check spam, or ask the producer to make sure you've been invited.</p>
              <ResendLink send={() => sendLink(email.trim())} />
              <div className="actions"><button className="btn" type="button" onClick={() => setSent(false)}>Use a different email</button></div>
            </motion.div>
          ) : (
            <motion.form key="form" className="panel corner" onSubmit={submit} noValidate {...card}>
              <div className="slate">Crew access</div>
              <h1 style={{ fontSize: 44 }}>Sign in</h1>
              <p className="muted" style={{ margin: 0 }}>Enter your email and we'll send you a sign-in link. No password needed.</p>
              <div className="field"><label htmlFor="email">Email</label><input type="email" id="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div className="actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send my link"}</button></div>
              <div className="err" role="alert">{err}</div>
              <p className="hint" style={{ margin: 0 }}>New to the production? <Link to="/signup">Sign up here</Link>. Cast and crew both welcome.</p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
