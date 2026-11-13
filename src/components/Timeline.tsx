import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fmtDate, iso } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { EASE } from "./Motion";

type Stop = [string, string, string]; // date, location, title

const DEFAULT_DAYS: Stop[] = [
  ["2026-11-29", "Asante's apartment", "Opening: the apartment & the drive"],
  ["2026-11-29", "Science Center", "First dream sequence"],
  ["2026-12-01", "Martin Eng. Bldg", "The lab"],
  ["2026-12-02", "Martin Eng. Bldg", "Walk-up, bathroom & stairs"],
  ["2026-12-06", "Well Springs", "The nursing home"],
  ["2026-12-10", "City Kitch", "The kitchen"],
  ["2026-12-13", "Lake Daniel Park", "The body bags"],
  ["2026-12-14", "Glenn McNairy", "Camp: storm night & the party"],
  ["2026-12-15", "Glenn McNairy", "Camp: the fight & the plan"],
  ["2026-12-16", "Glenwood Branch", "Going after Sage"],
  ["2026-12-17", "Glenwood Branch", "The office & the escape"],
  ["2026-12-18", "Location TBD", "Final scene: the truck"],
];
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen"];

function useCols(n: number) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width:760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:760px)");
    const f = () => setMobile(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return mobile ? 6 : n;
}

export function useShootStops() {
  const { session } = useAuth();
  const [stops, setStops] = useState<Stop[]>(DEFAULT_DAYS);
  const [heading, setHeading] = useState("Eleven days in the dark");
  useEffect(() => {
    if (!supabase || !session) return;
    supabase.from("shoot_days").select("shoot_date, location, title").order("shoot_date").order("sort_order").then(({ data, error }) => {
      if (error || !data || !data.length) return;
      const short = (l: string) => l.replace(" Engineering Building", " Eng. Bldg").replace(" Nursing Home", "").replace(" Branch Library", " Branch").replace(" Library", "").replace("Greensboro ", "");
      setStops(data.map((d: any) => [d.shoot_date, short(d.location), d.title] as Stop));
      const n = new Set(data.map((d: any) => d.shoot_date)).size;
      setHeading((WORDS[n] || n) + " days in the dark");
    });
  }, [session]);
  return { stops, heading };
}

export function Timeline({ stops }: { stops: Stop[] }) {
  const today = iso(new Date());
  const cols = useCols(stops.length);
  const [tip, setTip] = useState<number | null>(null);
  let nextFound = false;
  return (
    <div className="timeline">
      <div className="tl">
        <div className="tl-stops" style={{ ["--n" as any]: stops.length, gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {stops.map(([d, loc, title], i) => {
            const isPast = d < today;
            const isNext = !isPast && !nextFound && (nextFound = true);
            const sameAsPrev = i > 0 && stops[i - 1][0] === d;
            const first = i % cols === 0, last = i % cols === cols - 1 || i === stops.length - 1;
            const edge = first ? "left" : last ? "right" : "mid";
            return (
              <div key={i} className={"tl-stop" + (isPast ? " past" : "") + (isNext ? " next" : "")} tabIndex={0}
                onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(i)} onBlur={() => setTip(null)}>
                <motion.span className="tl-line" style={{ left: first ? "50%" : 0, right: last ? "50%" : 0 }}
                  initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.09, ease: EASE }} />
                <motion.div className="tl-date" initial={{ opacity: 0, y: -8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.09 + 0.1 }}>
                  {sameAsPrev ? "" : fmtDate(d, { month: "short", day: "numeric" })}
                  <small>{sameAsPrev ? "cont." : fmtDate(d, { weekday: "short" })}</small>
                </motion.div>
                <motion.span className="tl-dot" aria-hidden="true" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
                  animate={tip === i ? { scale: 1.35 } : undefined}
                  transition={{ type: "spring", stiffness: 380, damping: 18, delay: i * 0.09 + 0.2 }} />
                <span className="tl-loc">{loc}</span>
                <AnimatePresence>
                  {tip === i && (
                    <motion.div className="tl-tip" role="tooltip"
                      style={edge === "left" ? { left: 0 } : edge === "right" ? { left: "auto", right: 0 } : { x: "-50%" }}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
                      <b>{title}</b>
                      <div className="muted">{fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
