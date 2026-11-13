import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { EASE } from "@/components/Motion";

const card = { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE } };

/**
 * Where the emailed sign-in / confirmation link lands. The email carries a one-time code (token_hash);
 * we exchange it for a session here, in the browser. Because it happens in JavaScript, email apps that
 * "preview" links in the background can't use the code up before the person taps it.
 */
export default function ConfirmLogin() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [err, setErr] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!supabase) { setErr("The site isn't connected to its database yet."); return; }
      const code = params.get("token_hash");
      let ok = false;
      if (code) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: code, type: params.get("type") === "signup" ? "signup" : "email" });
        ok = !error;
      } else {
        // Older style link: the session arrives in the address bar and the client picks it up on its own.
        const { data } = await supabase.auth.getSession();
        ok = !!data.session;
      }
      if (!ok) { setErr("expired"); return; }
      await refresh();
      let next = "/calendar";
      try { next = localStorage.getItem("cerulean-next") || next; localStorage.removeItem("cerulean-next"); } catch { /* private mode */ }
      nav(/^\/(?!\/)/.test(next) ? next : "/calendar", { replace: true });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="login-wrap">
      <div className="login-card" style={{ display: "grid", gap: 18 }}>
        {err ? (
          <motion.div className="panel corner" {...card}>
            <div className="slate">Link problem</div>
            <h2>That link didn't work</h2>
            <p style={{ margin: 0 }}>{err === "expired" ? "It has expired or was already used. Each link works once and lasts about an hour." : err}</p>
            <div className="actions"><Link className="btn primary" to="/login">Send me a new link</Link></div>
          </motion.div>
        ) : (
          <motion.div className="panel corner" {...card}>
            <div className="slate">One moment</div>
            <h2>Signing you in…</h2>
            <p className="muted" style={{ margin: 0 }}>You'll be taken to the site in a second.</p>
          </motion.div>
        )}
      </div>
    </main>
  );
}
