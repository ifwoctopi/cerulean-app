import { useEffect, useState, type PointerEvent } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import { EASE } from "./Motion";

// First call: Sun Nov 29, 2026, 11:00 AM crew call (Eastern)
const START = new Date("2026-11-29T11:00:00-05:00");
const WRAP = new Date("2026-12-19T00:00:00-05:00");

function useCountdown() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now >= WRAP) return { label: "That's a wrap", d: 0, h: 0, m: 0, s: 0 };
  const rolling = now >= START;
  let ms = (rolling ? WRAP : START).getTime() - now.getTime();
  const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5;
  const m = Math.floor(ms / 6e4); ms -= m * 6e4;
  return { label: rolling ? "Rolling now · wrap in" : "Camera rolls in", d, h, m, s: Math.floor(ms / 1000) };
}

function Countdown() {
  const c = useCountdown();
  const units: [string, number][] = [["Days", c.d], ["Hours", c.h], ["Min", c.m], ["Sec", c.s]];
  return (
    <motion.div className="countdown" role="timer" aria-live="off" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 1.5, ease: EASE }}>
      <span className="lbl">{c.label}</span>
      {units.map(([cap, n], i) => (
        <div key={cap} style={{ display: "contents" }}>
          {i > 0 && <span className="cd-sep" aria-hidden="true">:</span>}
          <div className="cd-unit">
            <div className="cd-num" aria-label={n + " " + cap.toLowerCase()}><SlidingNumber number={n} padStart /></div>
            <span className="cd-cap">{cap}</span>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  const mx = useSpring(useMotionValue(72), { stiffness: 90, damping: 20 });
  const my = useSpring(useMotionValue(34), { stiffness: 90, damping: 20 });
  const bg = useMotionTemplate`radial-gradient(340px circle at ${mx}% ${my}%, rgba(62,166,242,.16), transparent 65%)`;
  function move(e: PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  }
  const rise = (delay: number) => reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease: EASE } };
  return (
    <section className="hero" aria-labelledby="film-title" onPointerMove={move}>
      <div className="light" aria-hidden="true" />
      <div className="scan" aria-hidden="true" />
      <motion.div className="torch" style={{ background: bg }} aria-hidden="true" />
      <div className="hero-in">
        <motion.div className="slate" {...rise(0.1)}>A thriller · Written by Staci Tranquille</motion.div>
        <h1 className="title" id="film-title">
          <span className="sr-only">Cerulean</span>
          <span aria-hidden="true">
            {[..."Cerulean"].map((ch, i) => (
              <motion.span key={i} className="ch"
                initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(8px)" }}
                animate={{ opacity: [0, 0.8, 0.1, 1, 0.3, 1], y: 0, filter: "blur(0px)" }}
                transition={{ duration: 1.1, delay: i * 0.075 + 0.25, times: [0, 0.3, 0.36, 0.44, 0.52, 0.6] }}>
                {ch}
              </motion.span>
            ))}
          </span>
        </h1>
        <motion.p className="tagline" {...rise(1.1)}>The storm was the cover story.</motion.p>
        <motion.div className="credits" {...rise(1.3)}>
          <span>Filming <b>Nov 29 – Dec 18, 2026</b></span>
          <span>Location <b>Greensboro, NC</b></span>
        </motion.div>
        <Countdown />
      </div>
    </section>
  );
}
