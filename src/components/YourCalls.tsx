import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/useLive";
import { isOnCall } from "@/lib/roles";
import { fmtDate, iso } from "@/lib/format";
import type { CalEntry, Person, ShootDay } from "@/lib/types";
import { Reveal } from "@/components/Motion";

/** Home-page list for signed-in members: the upcoming shoot days they're called on, with their own call time. */
export function YourCalls({ all = false }: { all?: boolean }) {
  const { profile } = useAuth();
  const [me, setMe] = useState<Person | null>(null);
  const [days, setDays] = useState<ShootDay[]>([]);
  const [mine, setMine] = useState<CalEntry[]>([]);
  const [calls, setCalls] = useState<{ day_id: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !profile?.member) return;
    const p = await supabase.from("people").select("*").eq("user_id", profile.id).maybeSingle();
    const d = await supabase.from("shoot_days").select("*").order("sort_order");
    if (p.error || d.error) { setLoaded(true); return; }
    const person = (p.data as Person | null) || null;
    setMe(person); setDays(d.data as ShootDay[]);
    if (person) {
      const [e, a] = await Promise.all([
        supabase.from("calendar_entries").select("*").eq("person_id", person.id),
        supabase.from("availability").select("day_id, status").eq("person_id", person.id),
      ]);
      setMine((e.data as CalEntry[]) || []); setCalls((a.data as any[]) || []);
    }
    setLoaded(true);
  }, [profile?.id, profile?.member]);
  useEffect(() => { load(); }, [load]);
  useLive(["shoot_days", "calendar_entries", "availability", "people"], load);

  if (!profile?.member || !loaded) return null;
  const today = iso(new Date());
  const upcoming = me ? days.filter(d => (all || d.shoot_date >= today) && isOnCall(me, d)).sort((a, b) => a.shoot_date.localeCompare(b.shoot_date)) : [];

  const answer = (d: ShootDay) => {
    const es = mine.filter(e => e.entry_date === d.shoot_date);
    if (es.some(e => e.status === "unavailable")) return { t: "You marked Can't", cls: "bad" };
    if (es.some(e => e.status === "tentative")) return { t: "You marked Maybe", cls: "" };
    if (es.length) return { t: "You're free", cls: "" };
    const c = calls.find(x => x.day_id === d.id);
    if (c) return { t: c.status === "no" ? "You marked Can't" : c.status === "maybe" ? "You marked Maybe" : "You're free", cls: c.status === "no" ? "bad" : "" };
    return { t: "No answer yet", cls: "warn" };
  };
  const callTime = (d: ShootDay) => {
    const t = me!.department === "crew" ? d.crew_call : d.cast_call;
    return !t || t === "TBD" ? "Call time to be announced" : "Call " + t + (d.wrap && d.wrap !== "TBD" ? " · wrap " + d.wrap : "");
  };

  return (
    <Reveal>
      <section className="yourcalls" aria-labelledby="yc-h">
        <div className="row" style={{ justifyContent: all ? "flex-end" : "space-between", alignItems: "end" }}>
          {!all && <div className="page-head"><div className="slate">Your schedule</div><h2 id="yc-h">Your call dates</h2></div>}
          <Link className="btn small" to="/calendar">Mark availability</Link>
        </div>
        {!me ? (
          <p className="hint">You aren't on the cast and crew list yet, so no call dates are showing. An admin can add you in Manage.</p>
        ) : upcoming.length === 0 ? (
          <p className="hint">{days.length ? "You aren't called on any upcoming days yet. This updates when an admin adds you to a call sheet." : "No shoot days are scheduled yet."}</p>
        ) : (
          <ul className="yc-list">
            {upcoming.map(d => {
              const a = answer(d);
              return (
                <li key={d.id} className={"yc-item" + (d.shoot_date < today ? " past" : "")}>
                  <div className="yc-date">{fmtDate(d.shoot_date, { weekday: "short", month: "short", day: "numeric" })}</div>
                  <div className="yc-main">
                    <b>{d.day_label}{d.title ? " · " + d.title : ""}</b>
                    <span className="meta">{callTime(d)}</span>
                    <span className="meta">{d.location}{d.scenes ? " · Scenes " + d.scenes : ""}</span>
                  </div>
                  <span className={"yc-tag " + a.cls}>{a.t}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Reveal>
  );
}
