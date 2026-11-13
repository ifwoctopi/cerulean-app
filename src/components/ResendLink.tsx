import { useEffect, useState } from "react";

/** "Resend link" button with a cooldown (the email service limits how often it will send). `send` returns an error message, or null on success. */
export function ResendLink({ send, seconds = 60 }: { send: () => Promise<string | null>; seconds?: number }) {
  // The cooldown is a deadline, not a counter, so it stays right if the tab is in the background.
  const [until, setUntil] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const wait = Math.max(0, Math.ceil((until - now) / 1000));

  useEffect(() => {
    if (until <= Date.now()) return;
    setNow(Date.now());
    const t = setInterval(() => { const n = Date.now(); setNow(n); if (n >= until) clearInterval(t); }, 500);
    return () => clearInterval(t);
  }, [until]);

  async function go() {
    setBusy(true); setMsg(null);
    const err = await send();
    setBusy(false);
    if (err) setMsg({ text: err, bad: true });
    else setMsg({ text: "Sent again. Check your inbox and spam." });
    setUntil(Date.now() + seconds * 1000);
  }
  return (
    <div className="actions" style={{ alignItems: "center" }}>
      <button className="btn" type="button" disabled={busy || wait > 0} onClick={go}>
        {busy ? "Sending…" : wait > 0 ? "Resend in " + wait + "s" : "Resend the link"}
      </button>
      <span className={msg?.bad ? "err" : "toast"} role={msg?.bad ? "alert" : "status"} aria-live="polite">{msg?.text}</span>
    </div>
  );
}
