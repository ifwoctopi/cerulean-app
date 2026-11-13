import { useState, type FormEvent } from "react";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { connected } from "@/lib/supabase";
import { EASE } from "./Motion";

const PAGES: [string, string][] = [["/", "Home"], ["/calendar", "Calendar"], ["/gallery", "On set"], ["/files", "Past meetings"]];

function TopBar() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const [hover, setHover] = useState<string | null>(null);
  const links: [string, string][] = [...PAGES, ...(profile?.role === "admin" ? [["/availability", "Call dates"] as [string, string], ["/admin", "Manage"] as [string, string]] : [])];
  return (
    <motion.header className="topbar" initial={{ y: "-100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: EASE }}>
      <div className="topbar-in">
        <Link className="wordmark" to="/" aria-label="Cerulean home">Cerulean</Link>
        <nav className="nav" aria-label="Site" onMouseLeave={() => setHover(null)}>
          {links.map(([to, label]) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <NavLink key={to} to={to} end={to === "/"} className={to === "/admin" ? "admin-link" : undefined}
                aria-current={active ? "page" : undefined} onMouseEnter={() => setHover(to)} onFocus={() => setHover(to)} onBlur={() => setHover(null)}>
                {hover === to && <motion.span layoutId="nav-hl" className="hl" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                {label}
                {active && <motion.span layoutId="nav-ul" className="ul" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              </NavLink>
            );
          })}
        </nav>
        <div className="who">
          {profile ? (
            <>
              <span className="rec" aria-hidden="true" />
              <span>{(profile.full_name || profile.email || "Signed in") + (profile.role === "admin" ? " · admin" : profile.member ? "" : " · pending")}</span>
              <button className="btn small" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : connected ? (
            <>
              <Link className="btn small" to={"/login?next=" + encodeURIComponent(pathname)}>Sign in</Link>
              <Link className="btn small primary" to="/signup">Sign up</Link>
            </>
          ) : null}
        </div>
      </div>
    </motion.header>
  );
}

function NamePrompt() {
  const { profile, setName } = useAuth();
  const [v, setV] = useState(""); const [msg, setMsg] = useState("");
  const show = !!profile && !profile.full_name;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (v.trim().length < 2) { setMsg("Type your name first."); return; }
    if (!(await setName(v.trim()))) setMsg("Couldn't save your name. Try again.");
  }
  return (
    <AnimatePresence>
      {show && (
        <motion.form className="topbar-in" onSubmit={submit} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", paddingBlock: 10 }}>
          <label htmlFor="my-name">What should we call you?</label>
          <input type="text" id="my-name" maxLength={80} placeholder="First and last name" autoComplete="name" style={{ maxWidth: 260 }} value={v} onChange={e => setV(e.target.value)} />
          <button className="btn small primary" type="submit">Save name</button>
          <span className="hint">{msg}</span>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

export function Shell() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  return (
    <>
      <TopBar />
      <NamePrompt />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32, ease: EASE }}>
          {outlet}
        </motion.div>
      </AnimatePresence>
      <footer className="footer">Cerulean · Written by Staci Tranquille · Greensboro, NC · 2026</footer>
    </>
  );
}
