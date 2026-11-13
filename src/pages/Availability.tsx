import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/useLive";
import { fmtDate, windowText } from "@/lib/format";
import type { Person, ShootDay } from "@/lib/types";
import { Filter } from "@/components/Filter";
import { EASE, PageHead } from "@/components/Motion";

type A = "yes" | "maybe" | "no";
const ST: Record<A, string> = { yes: "Coming", maybe: "Maybe", no: "Can't come" };
type Part = { s: A; r: string; w: string };
const RANK: Record<A, number> = { yes: 0, maybe: 1, no: 2 };
const worst = (ps?: Part[]) => (ps && ps.length ? ps.reduce((a, b) => (RANK[b.s] > RANK[a.s] ? b : a)) : undefined);
const FROM_CAL: Record<string, A> = { available: "yes", tentative: "maybe", unavailable: "no" };
const scheduled = (p: { department: string; characters: string[] }, d: ShootDay) => p.department === "crew" || (p.characters || []).some(c => d.characters.includes(c));
const label = (p: Person) => (p.department === "cast" ? (p.characters || []).join(", ") : p.job);
const short = (d: ShootDay) => fmtDate(d.shoot_date, { month: "short", day: "numeric" });
const long = (d: ShootDay) => fmtDate(d.shoot_date, { weekday: "short", month: "short", day: "numeric" });

/** Admin-only, read-only overview of who's coming to each call date. Cast answer on the calendar. */
export default function Availability() {
  const [days, setDays] = useState<ShootDay[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [answers, setAnswers] = useState<Record<string, Record<string, Part[]>>>({});
  const [characters, setCharacters] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "cast" | "crew">("all");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [d, p, a, e] = await Promise.all([
      supabase.from("shoot_days").select("*").order("sort_order"),
      supabase.from("people").select("*").order("name"),
      supabase.from("availability").select("person_id, day_id, status, reason"),
      supabase.from("calendar_entries").select("person_id, entry_date, status, reason, time_note, start_time, end_time"),
    ]);
    if (d.error || p.error || a.error || e.error) { setStatus("Couldn't load the schedule. Make sure supabase/schema.sql has been run, then refresh."); console.error(d.error || p.error || a.error || e.error); return; }
    const ds = d.data as ShootDay[], ps = p.data as Person[];
    const map: Record<string, Record<string, Part[]>> = {};
    // Older call-date answers first, then calendar entries on a shoot day's date win.
    (a.data as any[]).forEach(r => { (map[r.person_id] = map[r.person_id] || {})[r.day_id] = [{ s: r.status, r: r.reason, w: "" }]; });
    const byDate: Record<string, ShootDay[]> = {};
    ds.forEach(x => (byDate[x.shoot_date] = byDate[x.shoot_date] || []).push(x));
    const grouped: Record<string, any[]> = {};
    (e.data as any[]).forEach(r => (grouped[r.person_id + "|" + r.entry_date] = grouped[r.person_id + "|" + r.entry_date] || []).push(r));
    Object.entries(grouped).forEach(([k, rs]) => {
      const [pid, date] = k.split("|");
      const parts: Part[] = [...rs].sort((x, y) => (x.start_time || "").localeCompare(y.start_time || "")).map(r => ({ s: FROM_CAL[r.status], r: r.reason, w: [windowText(r), r.time_note].filter(Boolean).join(" · ") }));
      (byDate[date] || []).forEach(day => { (map[pid] = map[pid] || {})[day.id] = parts; });
    });
    const seen = new Set<string>(), chars: string[] = [];
    ds.forEach(x => x.characters.forEach(c => { if (!seen.has(c)) { seen.add(c); chars.push(c); } }));
    setDays(ds); setPeople(ps); setAnswers(map); setCharacters(chars); setLoaded(true); setStatus(null);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(["calendar_entries", "availability", "people"], load);

  return (
    <main className="page" id="main">
      <PageHead slate="Admin only · Nov 29 – Dec 18, 2026" title="Call dates" lede="Who's coming to each call date. Cast and crew mark their own dates on the calendar, and those answers show up here." />
      {status && <div className="notice bad">{status}</div>}
      <Board days={days} people={people} answers={answers} characters={characters} filter={filter} setFilter={setFilter} refresh={load} loaded={loaded} />
    </main>
  );
}

function Board({ days, people, answers, characters, filter, setFilter, refresh, loaded }: {
  days: ShootDay[]; people: Person[]; answers: Record<string, Record<string, Part[]>>; characters: string[];
  filter: "all" | "cast" | "crew"; setFilter: (f: "all" | "cast" | "crew") => void; refresh: () => Promise<unknown>; loaded: boolean;
}) {
  const claimed = new Set(people.flatMap(p => p.characters || []));
  const open = characters.filter(c => !claimed.has(c));
  const issuesByDay = days.map(d => ({
    d, probs: people.flatMap(p => (answers[p.id]?.[d.id] || []).filter(x => x.s !== "yes").map(a => ({ p, a })))
      .sort((x, y) => (RANK[y.a.s] - RANK[x.a.s]) || (Number(scheduled(y.p, d)) - Number(scheduled(x.p, d)))),
  })).filter(x => x.probs.length);
  const groups = (filter === "all" ? ["cast", "crew"] : [filter]) as ("cast" | "crew")[];
  let rows = 0;
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h2>Counts by date</h2><button className="btn small" type="button" onClick={() => refresh()}>Refresh</button></div>
        <p className="hint" style={{ margin: 0 }}>Counts cover the people on each day's call sheet: all crew, plus cast whose characters are in that day's scenes. Red means someone on the call sheet can't come.</p>
        <div className="summary">
          {days.map((d, i) => {
            const on = people.filter(p => scheduled(p, d));
            const n = { yes: 0, maybe: 0, no: 0, none: 0 };
            on.forEach(p => { const a = worst(answers[p.id]?.[d.id]); n[a ? a.s : "none"]++; });
            const tot = Math.max(1, on.length);
            return (
              <motion.a key={d.id} className={"sum" + (n.no ? " bad" : "")} href="#board" initial={{ opacity: 0, y: 14 }} animate={{ opacity: loaded ? 1 : 0, y: 0 }} transition={{ duration: 0.5, delay: i * 0.04, ease: EASE }}
                onClick={ev => { ev.preventDefault(); document.getElementById("iss-" + d.id)?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>
                <span className="d">{short(d)}</span><span className="meta">{d.location}</span>
                <div className="bar" role="img" aria-label={`${n.yes} coming, ${n.maybe} maybe, ${n.no} can't, ${n.none} no answer`}>
                  {(["y", "m", "n"] as const).map((c, j) => <motion.i key={c} className={c} style={{ width: ([n.yes, n.maybe, n.no][j] / tot) * 100 + "%", transformOrigin: "left" }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: i * 0.04 + 0.2, ease: EASE }} />)}
                </div>
                <div className="counts"><span className="c-yes">✓{n.yes}</span><span className="c-maybe">?{n.maybe}</span><span className="c-no">✕{n.no}</span><span className="c-none">·{n.none}</span></div>
              </motion.a>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Can't come or not sure</h2>
        <div className="issues">
          {issuesByDay.map(({ d, probs }) => (
            <div key={d.id} className="issue-day" id={"iss-" + d.id}>
              <h3>{long(d)} · {d.location}</h3>
              {probs.map(({ p, a }, i) => {
                return (
                  <motion.div key={p.id + "-" + i} className="issue" initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}>
                    <span className={"pill " + a.s}>{ST[a.s]}</span>
                    <span className="who">{p.name} ({label(p)}){a.w ? " · " + a.w : ""}{scheduled(p, d) ? "" : " · not on this call sheet"}</span>
                    <span className="why">{a.r}</span>
                  </motion.div>
                );
              })}
            </div>
          ))}
          {!issuesByDay.length && <p className="empty">{people.length ? "Nobody has said they can't come." : "No answers yet. Anyone who can't come shows up here with their reason."}</p>}
        </div>
        <p className="hint" style={{ margin: 0 }}>{open.length ? "No one has signed up as: " + open.join(", ") + "." : "Every character has someone signed up."}</p>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Everyone</h2>
          <Filter value={filter} onChange={setFilter} options={[["all", "All"], ["cast", "Cast"], ["crew", "Crew"]]} />
        </div>
        <div className="legend"><span className="c-yes">✓ Coming</span><span className="c-maybe">? Maybe</span><span className="c-no">✕ Can't</span><span>· No answer</span><span>◐ Specific times</span><span>Empty: not on that call sheet</span></div>
        <div className="scroll">
          <table>
            <thead><tr><th scope="col">Name</th>{days.map(d => <th key={d.id} scope="col"><b>{short(d)}</b>{d.location.replace(/ (Library|Building|Nursing Home|Science Center|Park)$/, "")}</th>)}</tr></thead>
            <tbody>
              {groups.map(g => {
                const list = people.filter(p => p.department === g);
                if (!list.length) return null;
                return [
                  <tr key={g} className="grp"><th colSpan={days.length + 1}>{g === "cast" ? "Cast" : "Crew"}</th></tr>,
                  ...list.map(p => { rows++; return (
                    <tr key={p.id}>
                      <th scope="row" title={p.notes ? "Notes: " + p.notes : undefined}>{p.name}<small>{label(p)}</small></th>
                      {days.map(d => {
                        const parts = answers[p.id]?.[d.id], a = worst(parts);
                        if (a && parts) {
                          const lines = parts.map(x => ST[x.s] + (x.w ? " (" + x.w + ")" : "") + (x.r ? " — " + x.r : "")).join(String.fromCharCode(10));
                          return <td key={d.id} className={a.s} title={lines} aria-label={lines}>{a.s === "yes" ? "✓" : a.s === "maybe" ? "?" : "✕"}{parts.some(x => x.w) && <small className="part">◐</small>}</td>;
                        }
                        return scheduled(p, d) ? <td key={d.id} className="blank" aria-label="No answer yet">·</td> : <td key={d.id} className="na" aria-label="Not on this call sheet" />;
                      })}
                    </tr>
                  ); }),
                ];
              })}
              {!people.some(p => filter === "all" || p.department === filter) && <tr><td colSpan={days.length + 1} className="empty">Nobody here yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <span hidden>{rows}</span>
      </div>
    </div>
  );
}
