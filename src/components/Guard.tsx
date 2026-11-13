import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { connected, supabase } from "@/lib/supabase";
import { EASE } from "./Motion";

function Card({ slate, title, children }: { slate: string; title: string; children: ReactNode }) {
  return (
    <main className="page">
      <motion.div className="panel corner" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <div className="slate">{slate}</div>
        <h2>{title}</h2>
        {children}
      </motion.div>
    </main>
  );
}

function Pending() {
  const { profile, refresh } = useAuth();
  const [line, setLine] = useState("");
  useEffect(() => {
    if (!supabase || !profile) return;
    supabase.from("people").select("department, characters, job").eq("user_id", profile.id).maybeSingle().then(({ data }) => {
      if (data) setLine(data.department === "cast" ? "You signed up as cast, playing " + (data.characters || []).join(", ") + "." : data.department === "extra" ? "You signed up as an extra." : "You signed up as crew: " + data.job + ".");
    });
  }, [profile]);
  const first = profile?.full_name ? ", " + profile.full_name.split(" ")[0] : "";
  return (
    <Card slate="Waiting for approval" title="You're on the list">
      <p className="lede">Thanks{first}. The producer needs to approve your account before you can see the schedule and mark your availability. Check back soon. {line}</p>
      <div className="actions"><Link className="btn" to="/">Back home</Link><button className="btn" type="button" onClick={() => refresh()}>Check again</button></div>
    </Card>
  );
}

/** Wraps a page that needs a signed-in, approved person (and optionally an admin). */
export function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { profile, loading } = useAuth();
  const loc = useLocation();
  // remember where we were asked to go: an exiting page re-renders with the NEW location during page transitions
  const where = useRef(loc.pathname + loc.hash).current;
  if (!connected) return (
    <Card slate="No signal" title="Connect Supabase first">
      <p className="lede">This page stores everything in your Supabase project. Add <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> to the <code>.env</code> file, then restart the dev server.</p>
    </Card>
  );
  if (loading) return <main className="page"><p className="empty">Loading…</p></main>;
  if (!profile) return <Navigate to={"/login?next=" + encodeURIComponent(where)} replace />;
  if (!profile.member) return <Pending />;
  if (admin && profile.role !== "admin") return (
    <Card slate="Restricted" title="Admins only">
      <p className="lede">Only admins can change events, roles, the cast board, files and set photos. Ask the producer if you need access.</p>
      <div className="actions"><Link className="btn" to="/">Back home</Link></div>
    </Card>
  );
  return <>{children}</>;
}
