import { useCallback, useEffect, useState, type FormEvent } from "react";
import { clockInput, clockText } from "@/lib/format";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { Person, ShootDay } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { EASE, PageHead } from "@/components/Motion";
import { SiteTabs, TabsContent } from "@/components/SiteTabs";

interface Prof { id: string; full_name: string; role: "admin" | "member"; approved: boolean; created_at: string }
const label = (p: Person) => (p.department === "cast" ? (p.characters || []).join(", ") : p.job);
const BASE = ["Asante", "Gaia", "Eli", "David", "Sage"];

function Row({ i, children }: { i: number; children: React.ReactNode }) {
  return <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, delay: Math.min(i, 14) * 0.035, ease: EASE }} className="arow">{children}</motion.div>;
}

function Chips({ all, selected, onChange }: { all: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips" role="group">
      {all.map(c => <label key={c} className="chip"><input type="checkbox" checked={selected.includes(c)} onChange={e => onChange(e.target.checked ? [...selected, c] : selected.filter(x => x !== c))} />{c}</label>)}
    </div>
  );
}

export default function Admin() {
  const { profile } = useAuth();
  const { hash } = useLocation();
  const nav = useNavigate();
  const tab = ["#roles", "#access"].includes(hash) ? hash.slice(1) : "events";
  const [days, setDays] = useState<ShootDay[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [profiles, setProfiles] = useState<Prof[]>([]);
  const [allChars, setAllChars] = useState<string[]>(BASE);
  const [status, setStatus] = useState<{ msg: string; kind?: string } | null>(null);
  const [evEdit, setEvEdit] = useState<{ day: ShootDay | null } | null>(null);
  const [pEdit, setPEdit] = useState<{ person: Person | null } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return false;
    const [d, p, pr] = await Promise.all([
      supabase.from("shoot_days").select("*").order("shoot_date").order("sort_order"),
      supabase.from("people").select("*").order("name"),
      supabase.from("profiles").select("id, full_name, role, approved, created_at").order("created_at"),
    ]);
    const err = d.error || p.error || pr.error;
    if (err) { console.error(err); setStatus({ msg: "Couldn't load. Make sure the latest supabase/schema.sql has been run.", kind: "bad" }); return false; }
    const ds = d.data as ShootDay[], ps = p.data as Person[];
    setDays(ds); setPeople(ps); setProfiles(pr.data as Prof[]);
    const seen = new Set<string>(), out: string[] = [];
    [...BASE, ...ds.flatMap(x => x.characters), ...ps.flatMap(x => x.characters || [])].forEach(c => { if (c && !seen.has(c)) { seen.add(c); out.push(c); } });
    setAllChars(out);
    return true;
  }, []);
  useEffect(() => { load(); }, [load]);

  const sorted = [...profiles].sort((a, b) => (a.approved === false && a.role !== "admin" ? 0 : 1) - (b.approved === false && b.role !== "admin" ? 0 : 1));
  const waiting = sorted.filter(p => p.approved === false && p.role !== "admin").length;

  async function delDay(d: ShootDay) {
    const { error } = await supabase!.from("shoot_days").delete().eq("id", d.id);
    if (error) { setStatus({ msg: "Couldn't delete: " + error.message, kind: "bad" }); return; }
    setConfirm(null); await load(); setStatus({ msg: "Event deleted." });
  }
  async function delPerson(p: Person) {
    const { error } = await supabase!.from("people").delete().eq("id", p.id);
    if (error) { setStatus({ msg: "Couldn't remove: " + error.message, kind: "bad" }); return; }
    setConfirm(null); await load(); setStatus({ msg: p.name + " removed." });
  }

  return (
    <main className="page" id="main">
      <PageHead slate="Admin only" title="Manage" lede="Change the schedule, decide who plays who, and choose who else gets admin access. Cast photos are edited on the home page, and files and set photos are uploaded on their own pages. Only admins can do any of this." />
      <AnimatePresence>{status && <motion.div className={"notice" + (status.kind ? " " + status.kind : "")} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{status.msg}</motion.div>}</AnimatePresence>

      <SiteTabs value={tab} onValueChange={v => nav({ hash: v === "events" ? "#events" : "#" + v }, { replace: true })}
        tabs={[{ value: "events", label: "Events" }, { value: "roles", label: "Cast & crew roles" }, { value: "access", label: "Approvals & access" + (waiting ? ` (${waiting} waiting)` : "") }]}>
        <TabsContent value="events">
          <section style={{ display: "grid", gap: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h2>Shoot days &amp; events</h2><button className="btn primary" type="button" onClick={() => setEvEdit({ day: null })}>+ Add an event</button></div>
            <p className="hint" style={{ margin: 0 }}>These drive the call dates page, the calendar and the timeline. Characters decide whose call sheet an event is on.</p>
            <div className="rows">
              {!days.length && <p className="empty">No events yet. Add the first one.</p>}
              <AnimatePresence initial={false}>
                {days.map((d, i) => (
                  <Row key={d.id} i={i}>
                    <div className="when">{fmtDate(d.shoot_date, { month: "short", day: "numeric" })}<small>{d.day_label}</small></div>
                    <div className="what"><b>{d.title}</b>
                      <span className="meta">{d.location + " · " + (d.crew_call === "TBD" ? "times TBD" : d.crew_call + "–" + d.wrap) + " · " + (d.characters.length ? d.characters.join(", ") : "no cast")}</span>{" "}
                      <span className={"tag" + (d.confirmed ? " on" : " pend")}>{d.confirmed ? "Confirmed" : "Not confirmed"}</span></div>
                    <div className="actions">
                      {confirm === "d" + d.id ? (<><span className="hint">Delete this event and everyone's answers for it?</span>
                        <button className="btn small danger" type="button" onClick={() => delDay(d)}>Delete</button><button className="btn small" type="button" onClick={() => setConfirm(null)}>Keep</button></>)
                        : (<><button className="btn small" type="button" onClick={() => setEvEdit({ day: d })}>Edit</button><button className="btn small danger" type="button" onClick={() => setConfirm("d" + d.id)}>Delete</button></>)}
                    </div>
                  </Row>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="roles">
          <section style={{ display: "grid", gap: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h2>Who plays who</h2><button className="btn primary" type="button" onClick={() => setPEdit({ person: null })}>+ Add a person</button></div>
            <p className="hint" style={{ margin: 0 }}>Everyone else can add themselves once, but only admins can change cast or crew, characters, or jobs after that.</p>
            <div className="rows">
              {!people.length && <p className="empty">Nobody's on the list yet.</p>}
              <AnimatePresence initial={false}>
                {people.map((p, i) => (
                  <Row key={p.id} i={i}>
                    <div className="when">{p.department === "cast" ? "Cast" : "Crew"}<small>{p.user_id ? "Signed in" : "Not signed in"}</small></div>
                    <div className="what"><b>{p.name}</b><span className="meta">{p.department === "cast" ? "Plays " + label(p) : label(p)}</span></div>
                    <div className="actions">
                      {confirm === "p" + p.id ? (<><span className="hint">Remove {p.name} and their answers?</span>
                        <button className="btn small danger" type="button" onClick={() => delPerson(p)}>Remove</button><button className="btn small" type="button" onClick={() => setConfirm(null)}>Keep</button></>)
                        : (<><button className="btn small" type="button" onClick={() => setPEdit({ person: p })}>Edit</button><button className="btn small danger" type="button" onClick={() => setConfirm("p" + p.id)}>Remove</button></>)}
                    </div>
                  </Row>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="access">
          <section style={{ display: "grid", gap: 14 }}>
            <h2>Approvals &amp; admin access</h2>
            <p className="hint" style={{ margin: 0 }}>New sign-ups wait at the top until you approve them. Everyone who has signed in to the site. Admins can change events, roles, the cast board, files and set photos. You can't change your own access.</p>
            <div className="rows">
              <AnimatePresence initial={false}>
                {sorted.map((p, i) => <AccessRow key={p.id} i={i} p={p} me={p.id === profile!.id} roster={people.find(x => x.user_id === p.id)} onChanged={async (m) => { await load(); if (m) setStatus({ msg: m }); }} />)}
              </AnimatePresence>
            </div>
          </section>
        </TabsContent>
      </SiteTabs>

      <EventEditor state={evEdit} count={days.length} allChars={allChars} onClose={() => setEvEdit(null)}
        onSaved={async m => { setEvEdit(null); await load(); setStatus({ msg: m }); }} />
      <PersonEditor state={pEdit} allChars={allChars} onClose={() => setPEdit(null)}
        onSaved={async () => { setPEdit(null); await load(); setStatus({ msg: "Saved." }); }} />
    </main>
  );
}

function AccessRow({ i, p, me, roster, onChanged }: { i: number; p: Prof; me: boolean; roster?: Person; onChanged: (msg?: string) => Promise<void> }) {
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [role, setRole] = useState(p.role);
  useEffect(() => setRole(p.role), [p.role]);
  const signedUpAs = roster ? (roster.department === "cast" ? "Cast · plays " + (roster.characters || []).join(", ") : "Crew · " + roster.job) : "Not on the cast & crew list";
  if (p.approved === false && p.role !== "admin") {
    const decide = async (allow: boolean) => {
      const { error } = await supabase!.rpc("set_user_access", { target: p.id, allow });
      if (error) { setMsg({ t: error.message, bad: true }); return; }
      if (!allow && roster) await supabase!.from("people").delete().eq("id", roster.id);
      await onChanged(allow ? (p.full_name || "They") + " can now see the schedule and mark availability." : "Sign-up declined.");
    };
    return (
      <Row i={i}>
        <div className="when" style={{ borderColor: "var(--amber)" }}><span className="admin-badge">Waiting</span></div>
        <div className="what"><b>{p.full_name || "No name given"}</b><span className="meta">{signedUpAs} · signed up {fmtDate(p.created_at)}</span></div>
        <div className="actions"><button className="btn small primary" type="button" onClick={() => decide(true)}>Approve</button><button className="btn small danger" type="button" onClick={() => decide(false)}>Decline</button>{msg && <span className="err">{msg.t}</span>}</div>
      </Row>
    );
  }
  async function change(v: "admin" | "member") {
    const { error } = await supabase!.rpc("set_user_role", { target: p.id, new_role: v });
    if (error) { setMsg({ t: error.message, bad: true }); setRole(p.role); return; }
    setRole(v); setMsg({ t: "Saved." });
  }
  return (
    <Row i={i}>
      <div className="when">{role === "admin" ? <span className="admin-badge">Admin</span> : "Member"}</div>
      <div className="what"><b>{(p.full_name || "No name yet") + (me ? " (you)" : "")}</b><span className="meta">{signedUpAs} · joined {fmtDate(p.created_at)}</span></div>
      <div className="actions">
        <select aria-label={"Access for " + (p.full_name || "this person")} disabled={me} style={{ width: "auto" }} value={role} onChange={e => change(e.target.value as "admin" | "member")}>
          <option value="member">Member</option><option value="admin">Admin</option>
        </select>
        {msg && <span className={msg.bad ? "err" : "toast"}>{msg.t}</span>}
      </div>
    </Row>
  );
}

function EventEditor({ state, count, allChars, onClose, onSaved }: { state: { day: ShootDay | null } | null; count: number; allChars: string[]; onClose: () => void; onSaved: (m: string) => void }) {
  const day = state?.day || null;
  const blank = { date: "", label: "", title: "", loc: "", addr: "", scenes: "", crew: "", cast: "", wrap: "", chars: [] as string[], conf: false };
  const [f, setF] = useState(blank);
  const [extra, setExtra] = useState<string[]>([]); const [newChar, setNewChar] = useState(""); const [err, setErr] = useState("");
  useEffect(() => {
    if (!state) return;
    const d = state.day;
    setF(d ? { date: d.shoot_date, label: d.day_label, title: d.title, loc: d.location, addr: d.address, scenes: d.scenes, crew: clockInput(d.crew_call), cast: clockInput(d.cast_call), wrap: clockInput(d.wrap), chars: d.characters, conf: d.confirmed } : blank);
    setExtra([]); setNewChar(""); setErr("");
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const chars = [...allChars, ...extra.filter(c => !allChars.includes(c))];
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.date) { setErr("Pick a date."); return; }
    if (f.title.trim().length < 2) { setErr("Say what's happening."); return; }
    if (f.loc.trim().length < 2) { setErr("Add a location, or type TBD."); return; }
    // Times come from time pickers. If an old value was free text that can't be a picker value, keep it unless a time is chosen.
    const keep = (v: string, old?: string) => (v ? clockText(v) : old && old !== "TBD" && !clockInput(old) ? old : "TBD");
    const row = { shoot_date: f.date, day_label: f.label.trim() || "Event", title: f.title.trim(), location: f.loc.trim(), address: f.addr.trim(), scenes: f.scenes.trim(),
      crew_call: keep(f.crew, day?.crew_call), cast_call: keep(f.cast, day?.cast_call), wrap: keep(f.wrap, day?.wrap), characters: f.chars, confirmed: f.conf };
    const res = day ? await supabase!.from("shoot_days").update(row).eq("id", day.id)
      : await supabase!.from("shoot_days").insert({ id: "e" + Date.now().toString(36), sort_order: 100 + count, ...row });
    if (res.error) { setErr("Couldn't save: " + res.error.message); return; }
    onSaved(day ? "Event updated." : "Event added.");
  }
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={!!state} onOpenChange={o => !o && onClose()} slate="Event" title={day ? "Edit event" : "Add an event"}>
      <form style={{ display: "grid", gap: 16 }} onSubmit={submit} noValidate>
        <div className="row">
          <div className="field"><label htmlFor="ev-date">Date</label><input type="date" id="ev-date" value={f.date} onChange={set("date")} /></div>
          <div className="field"><label htmlFor="ev-label">Label</label><input type="text" id="ev-label" maxLength={40} placeholder="Day 12, Table read, Pickups…" value={f.label} onChange={set("label")} /></div>
        </div>
        <div className="field"><label htmlFor="ev-title">What's happening</label><input type="text" id="ev-title" maxLength={120} placeholder="Final scene: the truck" value={f.title} onChange={set("title")} /></div>
        <div className="row">
          <div className="field"><label htmlFor="ev-loc">Location</label><input type="text" id="ev-loc" maxLength={120} value={f.loc} onChange={set("loc")} /></div>
          <div className="field"><label htmlFor="ev-addr">Address</label><input type="text" id="ev-addr" maxLength={200} value={f.addr} onChange={set("addr")} /></div>
        </div>
        <div className="field"><label htmlFor="ev-scenes">Scenes</label><input type="text" id="ev-scenes" maxLength={200} placeholder="35 (exterior)" value={f.scenes} onChange={set("scenes")} /></div>
        <div className="row">
          <div className="field"><label htmlFor="ev-crew">Crew call</label><input type="time" id="ev-crew" value={f.crew} onChange={set("crew")} /></div>
          <div className="field"><label htmlFor="ev-cast">Cast call</label><input type="time" id="ev-cast" value={f.cast} onChange={set("cast")} /></div>
          <div className="field"><label htmlFor="ev-wrap">Wrap</label><input type="time" id="ev-wrap" value={f.wrap} onChange={set("wrap")} /></div>
        </div>
        <div className="field">
          <span className="label">Characters on the call sheet</span>
          <Chips all={chars} selected={f.chars} onChange={v => setF({ ...f, chars: v })} />
          <div className="row" style={{ alignItems: "center" }}>
            <input type="text" maxLength={40} placeholder="Add a character not listed" style={{ maxWidth: 260 }} value={newChar} onChange={e => setNewChar(e.target.value)} />
            <button className="btn small" type="button" onClick={() => { const v = newChar.trim(); if (v.length < 2) return; setExtra([...extra, v]); setF({ ...f, chars: [...f.chars, v] }); setNewChar(""); }}>Add</button>
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={f.conf} onChange={e => setF({ ...f, conf: e.target.checked })} /> Confirmed (location and times are locked)</label>
        <div className="actions"><button className="btn primary" type="submit">Save event</button><button className="btn" type="button" onClick={onClose}>Cancel</button><span className="err" role="alert">{err}</span></div>
      </form>
    </Modal>
  );
}

function PersonEditor({ state, allChars, onClose, onSaved }: { state: { person: Person | null } | null; allChars: string[]; onClose: () => void; onSaved: () => void }) {
  const p = state?.person || null;
  const [name, setName] = useState(""); const [dept, setDept] = useState<"cast" | "crew">("cast"); const [chars, setChars] = useState<string[]>([]); const [job, setJob] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (!state) return; setName(p?.name || ""); setDept(p?.department || "cast"); setChars(p?.characters || []); setJob(p?.job || ""); setErr(""); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (name.trim().length < 2) { setErr("Add a name."); return; }
    if (dept === "cast" && !chars.length) { setErr("Pick at least one character."); return; }
    if (dept === "crew" && job.trim().length < 2) { setErr("Add their job on set."); return; }
    const row = { name: name.trim(), department: dept, characters: dept === "cast" ? chars : [], job: dept === "cast" ? "" : job.trim(), updated_at: new Date().toISOString() };
    const res = p ? await supabase!.from("people").update(row).eq("id", p.id) : await supabase!.from("people").insert(row);
    if (res.error) { setErr("Couldn't save: " + res.error.message); return; }
    onSaved();
  }
  return (
    <Modal open={!!state} onOpenChange={o => !o && onClose()} slate="Roles" title={p ? "Edit " + p.name : "Add a person"}>
      <form style={{ display: "grid", gap: 16 }} onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="p-name">Name</label><input type="text" id="p-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><span className="label">Department</span>
          <div className="seg" role="radiogroup" aria-label="Department">
            {(["cast", "crew"] as const).map(d => <label key={d} className="plain"><input type="radio" name="p-dept" checked={dept === d} onChange={() => setDept(d)} />{d === "cast" ? "Cast" : "Crew"}</label>)}
          </div></div>
        {dept === "cast"
          ? <div className="field"><span className="label">Plays</span><Chips all={allChars} selected={chars} onChange={setChars} /></div>
          : <div className="field"><label htmlFor="p-job">Job on set</label><input type="text" id="p-job" maxLength={80} value={job} onChange={e => setJob(e.target.value)} /></div>}
        <div className="actions"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={onClose}>Cancel</button><span className="err" role="alert">{err}</span></div>
      </form>
    </Modal>
  );
}
