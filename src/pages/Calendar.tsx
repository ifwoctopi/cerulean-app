import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CountingNumber } from "@animate-ui/react/primitives/texts/counting-number";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/useLive";
import { addDays, fmtDate, initials, iso, parseClock, windowText } from "@/lib/format";
import type { CalEntry, Person, ShootDay } from "@/lib/types";
import { Filter } from "@/components/Filter";
import { EASE, PageHead, Reveal } from "@/components/Motion";

type St = "available" | "tentative" | "unavailable";
const LABEL: Record<St, string> = { available: "Free", tentative: "Maybe", unavailable: "Can't" };
const FROM_CALL: Record<string, St> = { yes: "available", maybe: "tentative", no: "unavailable" };
const CHART_FROM = "2026-11-23", CHART_TO = "2026-12-24";
type Part = { s: St; r: string; t: string; src: "cal" | "call"; entry?: CalEntry };
type Status = Part & { parts: Part[] };
const RANK: Record<St, number> = { available: 0, tentative: 1, unavailable: 2 };

const scheduled = (p: Person, day: ShootDay) => p.department === "crew" || (p.characters || []).some(c => day.characters.includes(c));
const label = (p: Person) => (p.department === "cast" ? (p.characters || []).join(", ") : p.job);
const timeText = (e: CalEntry) => [windowText(e), e.time_note].filter(Boolean).join(" · ");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar() {
  const { profile } = useAuth();
  const reduce = useReducedMotion();
  const isAdmin = profile!.role === "admin";
  const todayIso = iso(new Date());
  const [days, setDays] = useState<ShootDay[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [entries, setEntries] = useState<CalEntry[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "cast" | "crew" | "me">("all");
  const [month, setMonth] = useState(() => todayIso > "2026-12-31" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(2026, 10, 1));
  const [dir, setDir] = useState(1);
  const [selected, setSelected] = useState(todayIso >= "2026-11-01" && todayIso <= "2026-12-31" ? todayIso : "2026-11-29");
  const gridRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [d, p, e, a] = await Promise.all([
      supabase.from("shoot_days").select("*").order("sort_order"),
      supabase.from("people").select("*").order("name"),
      supabase.from("calendar_entries").select("*"),
      supabase.from("availability").select("person_id, day_id, status, reason"),
    ]);
    const err = d.error || p.error || e.error || a.error;
    if (err) { console.error(err); setStatus({ msg: "Couldn't load the calendar. Make sure the latest supabase/schema.sql has been run (it adds the calendar table), then refresh.", kind: "bad" }); return; }
    setDays(d.data as ShootDay[]); setPeople(p.data as Person[]); setEntries(e.data as CalEntry[]); setCalls(a.data as any[]); setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(["calendar_entries", "availability", "people"], load);

  const me = useMemo(() => people.find(x => x.user_id === profile!.id) || null, [people, profile]);
  const entriesBy = useMemo(() => {
    const m: Record<string, CalEntry[]> = {};
    entries.forEach(x => (m[x.person_id + "|" + x.entry_date] = m[x.person_id + "|" + x.entry_date] || []).push(x));
    Object.values(m).forEach(l => l.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")));
    return m;
  }, [entries]);
  const callMap = useMemo(() => { const m: Record<string, any> = {}; calls.forEach(x => (m[x.person_id + "|" + x.day_id] = x)); return m; }, [calls]);
  const shootBy = useMemo(() => { const m: Record<string, ShootDay[]> = {}; days.forEach(x => (m[x.shoot_date] = m[x.shoot_date] || []).push(x)); return m; }, [days]);

  const partsOf = useCallback((p: Person, date: string): Part[] => {
    const es = entriesBy[p.id + "|" + date];
    if (es?.length) return es.map(e => ({ s: e.status, r: e.reason, t: timeText(e), src: "cal" as const, entry: e }));
    for (const day of shootBy[date] || []) {
      const a = callMap[p.id + "|" + day.id];
      if (a) return [{ s: FROM_CALL[a.status], r: a.reason, t: "", src: "call" as const }];
    }
    return [];
  }, [entriesBy, callMap, shootBy]);
  // One status per person per day for the month view and counts: the most serious of their windows.
  const statusOf = useCallback((p: Person, date: string): Status | null => {
    const parts = partsOf(p, date);
    if (!parts.length) return null;
    return { ...parts.reduce((a, b) => (RANK[b.s] > RANK[a.s] ? b : a)), parts };
  }, [partsOf]);
  const visible = useMemo(() => filter === "me" ? (me ? [me] : []) : filter === "all" ? people : people.filter(p => p.department === filter), [filter, me, people]);
  const tally = useCallback((date: string) => {
    const n = { available: 0, tentative: 0, unavailable: 0, out: [] as [Person, St][] };
    visible.forEach(p => { const st = statusOf(p, date); if (st) { n[st.s]++; if (st.s !== "available") n.out.push([p, st.s]); } });
    return n;
  }, [visible, statusOf]);
  // A conflict is a Can't that overlaps this person's call (crew call or cast call, to wrap) on a shoot day.
  // If the call times aren't set yet, any Can't that day counts.
  const conflictFor = useCallback((p: Person, day: ShootDay) => {
    const call = parseClock(p.department === "crew" ? day.crew_call : day.cast_call), wrap = parseClock(day.wrap);
    return partsOf(p, day.shoot_date).some(pt => {
      if (pt.s !== "unavailable") return false;
      const w = pt.entry;
      if (!w?.start_time || !w.end_time || call === null || wrap === null) return true;
      const a = Number(w.start_time.slice(0, 2)) * 60 + Number(w.start_time.slice(3, 5)), b = Number(w.end_time.slice(0, 2)) * 60 + Number(w.end_time.slice(3, 5));
      return a < wrap && b > call;
    });
  }, [partsOf]);
  const conflictOn = (date: string) => (shootBy[date] || []).some(day => people.some(p => scheduled(p, day) && conflictFor(p, day)));

  const conflicts = useMemo(() => {
    let c = 0;
    days.forEach(day => people.forEach(p => { if (scheduled(p, day) && conflictFor(p, day)) c++; }));
    return c;
  }, [days, people, conflictFor]);
  const daysToCamera = Math.max(0, Math.ceil((new Date("2026-11-29T11:00:00-05:00").getTime() - Date.now()) / 864e5));

  function go(m: Date, d: number) { setDir(d); setMonth(m); }
  const select = (ds: string, scroll = true) => {
    setSelected(ds);
    if (scroll && window.innerWidth < 920) drawerRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  function onGridKey(e: KeyboardEvent) {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const ds = addDays(selected, map[e.key]);
    const d = new Date(ds + "T12:00:00");
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(ds);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-date="${ds}"]`)?.focus());
  }

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const monthKey = month.getFullYear() + "-" + month.getMonth();
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="page cal-page" id="main">
      <PageHead slate="Who's free, when" title="The calendar" lede="Pick any date and mark whether you're free. Shoot days glow blue. A white dot means someone on that day's call sheet can't make it." />

      <div className="stats" aria-label="Summary">
        {([["Days to camera", daysToCamera], ["Cast & crew signed up", people.length], ["Dates marked", Object.keys(entriesBy).length], ["Shoot-day conflicts", conflicts]] as [string, number][]).map(([cap, n], i) => (
          <motion.div key={cap} className={"stat" + (i === 3 ? " bad" : "")} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 + i * 0.07, ease: EASE }}>
            <span className="num">{loaded ? <CountingNumber number={n} transition={{ stiffness: 90, damping: 24 }} /> : 0}</span>
            <span className="cap">{cap}</span>
          </motion.div>
        ))}
      </div>

      {status && <div className={"notice" + (status.kind ? " " + status.kind : "")}>{status.msg}</div>}

      <div className="cal-wrap">
        <motion.section className="panel cal-main" aria-labelledby="cal-month" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.35, ease: EASE }}>
          <div className="cal-head">
            <div className="actions">
              <button className="btn small" type="button" aria-label="Previous month" onClick={() => go(new Date(month.getFullYear(), month.getMonth() - 1, 1), -1)}>←</button>
              <h2 className="cal-month" id="cal-month" aria-live="polite" style={{ overflow: "hidden" }}>
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.span key={monthKey} style={{ display: "inline-block" }} custom={dir}
                    initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.3, ease: EASE }}>
                    {monthLabel}
                  </motion.span>
                </AnimatePresence>
              </h2>
              <button className="btn small" type="button" aria-label="Next month" onClick={() => go(new Date(month.getFullYear(), month.getMonth() + 1, 1), 1)}>→</button>
            </div>
            <Filter value={filter} onChange={setFilter} options={[["all", "Everyone"], ["cast", "Cast"], ["crew", "Crew"], ["me", "Just me"]]} />
          </div>
          <div className="cal-grid" aria-hidden="true">{DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}</div>
          <motion.div key={monthKey} className="cal-grid" role="grid" aria-label="Month" ref={gridRef} onKeyDown={onGridKey}
            initial={reduce ? false : { opacity: 0, x: dir * 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            {cells.map((d, i) => {
              const ds = iso(d), inMonth = d.getMonth() === month.getMonth();
              const shoot = shootBy[ds], n = tally(ds), tot = n.available + n.tentative + n.unavailable;
              const sdText = shoot ? shoot.map(x => x.day_label.replace("Day ", "D").replace(" (cont.)", "+")).join(" · ") + " " + shoot[0].location : "";
              const aria = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + (shoot ? ", shoot day at " + shoot[0].location : "") + (tot ? ", " + n.available + " free, " + n.tentative + " maybe, " + n.unavailable + " can't" : "");
              return (
                <motion.button key={ds} type="button" role="gridcell" data-date={ds} aria-label={aria} aria-pressed={ds === selected}
                  className={"cal-cell" + (inMonth ? "" : " out") + (shoot ? " shoot" : "") + (ds === todayIso ? " today" : "") + (conflictOn(ds) ? " conflict" : "")}
                  initial={reduce ? false : { opacity: 0, scale: 0.9, y: 6 }} animate={{ opacity: inMonth ? 1 : 0.32, scale: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.011, ease: EASE }} whileTap={{ scale: 0.97 }}
                  onClick={() => select(ds)}>
                  <span className="n">{d.getDate()}</span>
                  {shoot && <span className="sd">{sdText}</span>}
                  {n.out.length > 0 && (
                    <span className="inis">
                      {n.out.slice(0, 3).map(([p, s]) => <span key={p.id} className={"ini " + (s === "unavailable" ? "u" : "t")} title={p.name + ": " + LABEL[s]}>{initials(p.name)}</span>)}
                      {n.out.length > 3 && <span className="ini more">+{n.out.length - 3}</span>}
                    </span>
                  )}
                  <span className="meter" aria-hidden="true">
                    {tot > 0 && (["available", "tentative", "unavailable"] as St[]).map((k, j) => (
                      <motion.i key={k} className={["m-a", "m-t", "m-u"][j]} style={{ width: (n[k] / tot) * 100 + "%", transformOrigin: "left" }}
                        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: i * 0.011 + 0.2, ease: EASE }} />
                    ))}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
          <div className="legend">
            <span><i className="ini u" style={{ display: "inline-grid" }}>AB</i> Can't</span>
            <span><i className="ini t" style={{ display: "inline-grid" }}>AB</i> Maybe</span>
            <span className="c-yes">▬ Free</span><span style={{ color: "var(--cerulean)" }}>■ Shoot day</span>
          </div>
        </motion.section>

        <aside className="panel corner drawer" ref={drawerRef} aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={selected} className="drawer-in" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.28, ease: EASE }}>
              {loaded && <Drawer ds={selected} days={days} people={people} me={me} isAdmin={isAdmin} profileId={profile!.id}
                statusOf={statusOf} partsOf={partsOf} shootBy={shootBy} onChanged={load} onError={m => setStatus({ msg: m, kind: "bad" })} />}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>

      <Reveal>
        <section className="panel" aria-labelledby="chart-h">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
            <div className="page-head"><div className="slate">Nov 23 – Dec 24</div><h2 id="chart-h">Availability chart</h2></div>
            <span className="legend"><span className="c-yes">■ Free</span><span className="c-maybe">■ Maybe</span><span className="c-no">■ Can't</span></span>
          </div>
          <p className="hint" style={{ margin: 0 }}>How many people marked each date. Shoot days are marked in blue. Click a column to open that date.</p>
          <Chart visible={visible} tally={tally} shootBy={shootBy} onPick={d => { const dd = new Date(d + "T12:00:00"); go(new Date(dd.getFullYear(), dd.getMonth(), 1), 1); select(d, false); gridRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }} />
        </section>
      </Reveal>

      <Reveal>
        <section className="panel" aria-labelledby="heat-h">
          <h2 id="heat-h">Everyone, day by day</h2>
          <p className="hint" style={{ margin: 0 }}>Hover a square for the reason. A cut corner means specific times only. Older call-date answers show here too.</p>
          <div className="scroll" style={{ padding: 10 }}><Heat list={visible} partsOf={partsOf} shootBy={shootBy} filter={filter} /></div>
        </section>
      </Reveal>
    </main>
  );
}

/* ---------- drawer: one date ---------- */
function Drawer({ ds, days: _days, people, me, isAdmin, profileId, statusOf, partsOf, shootBy, onChanged, onError }: {
  ds: string; days: ShootDay[]; people: Person[]; me: Person | null; isAdmin: boolean; profileId: string;
  statusOf: (p: Person, d: string) => Status | null; partsOf: (p: Person, d: string) => Part[]; shootBy: Record<string, ShootDay[]>; onChanged: () => Promise<void>; onError: (m: string) => void;
}) {
  const shoot = shootBy[ds] || [];
  const order: St[] = ["unavailable", "tentative", "available"];
  const rows = people.flatMap(p => partsOf(p, ds).map(pt => [p, pt] as const)).sort((a, b) => order.indexOf(a[1].s) - order.indexOf(b[1].s));
  const missing = shoot.length ? people.filter(p => shoot.some(day => scheduled(p, day)) && !statusOf(p, ds)) : [];
  async function clear(entry: CalEntry) {
    const { error } = await supabase!.from("calendar_entries").delete().eq("id", entry.id);
    if (error) { onError("Couldn't clear that entry. Try again."); return; }
    onChanged();
  }
  return (
    <>
      <div className="slate">{shoot.length ? "Shoot day" : "Selected date"}</div>
      <h2>{fmtDate(ds, { weekday: "short", month: "short", day: "numeric" })}</h2>
      {shoot.map(day => (
        <div key={day.id} className="shootcard">
          <b>{day.day_label} · {day.title}</b>
          <span className="meta">{day.location}{day.address ? " — " + day.address : ""}</span>
          <span className="meta">{day.crew_call === "TBD" ? "Times to be announced" : `Crew ${day.crew_call} · Cast ${day.cast_call} · Wrap ${day.wrap}`}</span>
          <span className="meta">Scenes {day.scenes}</span>
        </div>
      ))}
      <h3>{rows.length ? "Who's marked" : "Nobody's marked this date"}</h3>
      <div className="entries">
        {rows.map(([p, st], i) => {
          const canDel = st.src === "cal" && (isAdmin || (me && p.id === me.id));
          const onCall = shoot.some(day => scheduled(p, day));
          return (
            <motion.div key={st.entry?.id || p.id + "-call"} className="entry" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: EASE }}>
              <span className={"pill " + st.s}>{LABEL[st.s]}</span>
              <span className="nm">{p.name}</span>
              {canDel ? <button className="btn small" type="button" aria-label={"Clear " + p.name + "'s entry"} onClick={() => clear(st.entry!)}>Clear</button> : <span />}
              <span className="sub">{label(p) + (onCall ? " · on the call sheet" : "") + (st.t ? " · " + st.t : "") + (st.src === "call" ? " · from call dates" : "")}</span>
              {st.r && <span className="rs">{st.r}</span>}
            </motion.div>
          );
        })}
      </div>
      {missing.length > 0 && <p className="hint" style={{ margin: 0 }}>On the call sheet with no answer yet: {missing.map(p => p.name).join(", ")}.</p>}
      <DayForm key={ds} ds={ds} people={people} me={me} isAdmin={isAdmin} profileId={profileId} onSaved={onChanged} />
    </>
  );
}

function DayForm({ ds, people, me, isAdmin, profileId, onSaved }: {
  ds: string; people: Person[]; me: Person | null; isAdmin: boolean; profileId: string; onSaved: () => Promise<void>;
}) {
  const defaultPid = isAdmin ? (me?.id || people[0]?.id || "") : (me?.id || "");
  const [pid, setPid] = useState(defaultPid);
  const [s, setS] = useState<St>("unavailable");
  const [through, setThrough] = useState(ds);
  const [time, setTime] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);

  if (!me && !isAdmin) return (
    <div className="field" style={{ gap: 12, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <h3>Add to the calendar</h3>
      <p className="muted" style={{ margin: 0 }}>Your name isn't on the cast &amp; crew list yet. Ask the producer to add you, then you can mark your dates here.</p>
    </div>
  );
  if (isAdmin && !people.length) return <div className="field" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}><h3>Add to the calendar</h3><p className="muted" style={{ margin: 0 }}>Nobody is on the list yet.</p></div>;

  const changePerson = (id: string) => setPid(id);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    const r = reason.trim(), end = through || ds;
    if (s !== "available" && r.length < 3) { setErr(s === "unavailable" ? "Tell us why you can't make it." : "Tell us what it depends on."); return; }
    if (end < ds) { setErr("The end date has to be on or after " + fmtDate(ds) + "."); return; }
    if (!allDay && (!from || !to)) { setErr("Pick a start and an end time."); return; }
    if (!allDay && to <= from) { setErr("The end time has to be after the start time."); return; }
    const dates: string[] = [];
    for (let d = ds; d <= end && dates.length < 63; d = addDays(d, 1)) dates.push(d);
    setBusy(true);
    // One transaction in the database: all day replaces the person's day, a window replaces anything it overlaps.
    const rows = dates.length;
    const { error } = await supabase!.rpc("save_calendar_window", { p_person: pid, p_dates: dates, p_status: s, p_reason: s === "available" ? "" : r, p_note: time.trim(), p_start: allDay ? null : from, p_end: allDay ? null : to });
    setBusy(false);
    if (error) { console.error(error); setErr(/row-level|permission/i.test(error.message) ? "You can only change your own dates." : /start_time|end_time|schema cache|duplicate|unique|function/i.test(error.message) ? "Several time windows need supabase/calendar_times.sql run in the Supabase SQL Editor." : "Couldn't save: " + error.message); return; }
    setOk(rows > 1 ? "Saved " + rows + " days." : "Saved."); setReason(""); setTime("");
    onSaved();
  }
  return (
    <form className="field" style={{ gap: 12, borderTop: "1px solid var(--line)", paddingTop: 14 }} noValidate onSubmit={submit}>
      <h3>Add to the calendar</h3>
      <p className="hint" style={{ margin: 0 }}>Add as many time windows as you need for a day. Saving All day replaces the rest of that day.</p>
      {isAdmin && (
        <div className="field"><label htmlFor="c-person">For</label>
          <select id="c-person" value={pid} onChange={e => changePerson(e.target.value)}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name + (me && p.id === me.id ? " (me)" : "")}</option>)}
          </select></div>
      )}
      <div className="field"><span className="label">Status</span>
        <div className="seg" role="radiogroup" aria-label="Status">
          {(["available", "tentative", "unavailable"] as St[]).map(k => (
            <label key={k} className={k}><input type="radio" name="c-status" value={k} checked={s === k} onChange={() => setS(k)} />{k === "available" ? "I'm free" : k === "tentative" ? "Maybe" : "Can't make it"}</label>
          ))}
        </div></div>
      <div className="field"><span className="label">When</span>
        <div className="seg" role="radiogroup" aria-label="All day or specific times">
          <label className="plain"><input type="radio" name="c-when" checked={allDay} onChange={() => setAllDay(true)} />All day</label>
          <label className="plain"><input type="radio" name="c-when" checked={!allDay} onChange={() => setAllDay(false)} />Specific times</label>
        </div></div>
      <AnimatePresence initial={false}>
        {!allDay && (
          <motion.div key="times" className="row" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="field" style={{ flexBasis: 130 }}><label htmlFor="c-from">From</label><input type="time" id="c-from" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div className="field" style={{ flexBasis: 130 }}><label htmlFor="c-to">To</label><input type="time" id="c-to" value={to} onChange={e => setTo(e.target.value)} /></div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="row">
        <div className="field"><label htmlFor="c-through">Through (for several days)</label><input type="date" id="c-through" min={ds} max={addDays(ds, 62)} value={through} onChange={e => setThrough(e.target.value)} /></div>
        <div className="field"><label htmlFor="c-time">Note (optional)</label><input type="text" id="c-time" maxLength={80} placeholder="e.g. can leave early" value={time} onChange={e => setTime(e.target.value)} /></div>
      </div>
      <AnimatePresence initial={false}>
        {s !== "available" && (
          <motion.div key="why" className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <label htmlFor="c-reason">{s === "unavailable" ? "Why can't you make it? (required)" : "What's it depending on? (required)"}</label>
            <textarea id="c-reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="actions"><button className="btn primary" type="submit" disabled={busy}>Save</button><span className="toast" role="status">{ok}</span></div>
      <div className="err" role="alert">{err}</div>
    </form>
  );
}

/* ---------- chart ---------- */
function Chart({ visible, tally, shootBy, onPick }: { visible: Person[]; tally: (d: string) => { available: number; tentative: number; unavailable: number }; shootBy: Record<string, ShootDay[]>; onPick: (d: string) => void }) {
  const dates: string[] = []; for (let d = CHART_FROM; d <= CHART_TO; d = addDays(d, 1)) dates.push(d);
  const data = dates.map(d => [d, tally(d)] as const);
  const maxN = Math.max(1, visible.length, ...data.map(([, n]) => n.available + n.tentative + n.unavailable));
  const W = 940, H = 250, L = 34, R = 10, T = 14, B = 46, cw = (W - L - R) / dates.length, bw = Math.max(8, cw * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / maxN);
  const step = maxN <= 6 ? 1 : Math.ceil(maxN / 5);
  const ticks: number[] = []; for (let v = 0; v <= maxN; v += step) ticks.push(v);
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stacked column chart of how many people are free, maybe, or can't make it on each date from Nov 23 to Dec 24">
        <g className="grid">{ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 3} textAnchor="end">{v}</text></g>)}</g>
        {data.map(([d, n], i) => {
          const x = L + i * cw + (cw - bw) / 2, shoot = !!shootBy[d], dt = new Date(d + "T12:00:00");
          let base = 0;
          return (
            <g key={d} className="col" style={{ cursor: "pointer" }} tabIndex={0} role="button"
              aria-label={fmtDate(d) + ": " + n.available + " free, " + n.tentative + " maybe, " + n.unavailable + " can't"}
              onClick={() => onPick(d)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(d); } }}>
              <title>{fmtDate(d, { weekday: "short", month: "short", day: "numeric" }) + (shoot ? " (shoot day)" : "") + "\n" + n.available + " free · " + n.tentative + " maybe · " + n.unavailable + " can't"}</title>
              <rect x={x - (cw - bw) / 2} y={T} width={cw} height={H - T - B} fill={shoot ? "rgba(62,166,242,0.07)" : "transparent"} />
              <g className="bars">
                {(["available", "tentative", "unavailable"] as St[]).map((k, j) => {
                  if (!n[k]) return null;
                  const top = y(base + n[k]), h = y(base) - top; base += n[k];
                  return (
                    <motion.rect key={k} x={x} y={top} width={bw} height={h} rx={1} fill={["var(--ok)", "var(--amber)", "var(--blood)"][j]}
                      style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                      initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.022 + j * 0.05, ease: EASE }} />
                  );
                })}
              </g>
              <text x={x + bw / 2} y={H - B + 16} textAnchor="middle" className={shoot ? "sx" : ""}>{dt.getDate()}</text>
              {(dt.getDate() === 1 || i === 0) && <text x={x + bw / 2} y={H - B + 32} textAnchor="middle">{dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</text>}
              {shoot && <rect className="shootmark" x={x} y={H - B + 4} width={bw} height={2} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- heatmap ---------- */
function Heat({ list, partsOf, shootBy, filter }: { list: Person[]; partsOf: (p: Person, d: string) => Part[]; shootBy: Record<string, ShootDay[]>; filter: string }) {
  const dates: string[] = []; for (let d = CHART_FROM; d <= CHART_TO; d = addDays(d, 1)) dates.push(d);
  let k = 0;
  return (
    <table className="heat">
      <thead><tr><th scope="col" />{dates.map(d => {
        const dt = new Date(d + "T12:00:00");
        return <th key={d} scope="col" className={shootBy[d] ? "sx" : undefined} title={fmtDate(d, { weekday: "short", month: "short", day: "numeric" }) + (shootBy[d] ? " · shoot day" : "")}>
          {(dt.getDate() === 1 || d === CHART_FROM ? dt.toLocaleDateString("en-US", { month: "short" }) + " " : "") + dt.getDate()}</th>;
      })}</tr></thead>
      <tbody>
        {list.map(p => (
          <tr key={p.id}><th scope="row">{p.name}</th>
            {dates.map(d => {
              const parts = partsOf(p, d); const st = parts.length ? parts.reduce((a, b) => (RANK[b.s] > RANK[a.s] ? b : a)) : null; const win = parts.some(x => x.entry?.start_time); const idx = ++k;
              return (
                <motion.td key={d} className={[st ? st.s[0] : "", win ? "win" : "", shootBy[d] ? "sx" : ""].join(" ").trim() || undefined}
                  initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: Math.min(idx, 160) * 0.006 }}
                  title={parts.length ? p.name + " · " + fmtDate(d, { month: "short", day: "numeric" }) + "\n" + parts.map(x => LABEL[x.s] + (x.t ? " (" + x.t + ")" : "") + (x.r ? " — " + x.r : "")).join("\n") : undefined}
                  aria-label={parts.length ? parts.map(x => LABEL[x.s] + (x.t ? " " + x.t : "")).join(", ") : "No entry"} />
              );
            })}
          </tr>
        ))}
        {!list.length && <tr><td colSpan={dates.length + 1} className="empty" style={{ width: "auto" }}>{filter === "me" ? "You're not on the list yet. Ask the producer to add you." : "Nobody's on the list yet."}</td></tr>}
      </tbody>
    </table>
  );
}
