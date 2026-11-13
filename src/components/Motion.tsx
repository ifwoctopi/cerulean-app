import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

export const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Fades and lifts into place as it scrolls into view. */
export function Reveal({ children, delay = 0, y = 28, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} style={style}
      initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.85, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Staggered rise-in for a page heading block. */
export function PageHead({ slate, title, lede, id }: { slate: string; title: string; lede?: string; id?: string }) {
  const reduce = useReducedMotion();
  const item = (i: number) => reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: 0.08 + i * 0.08, ease: EASE } };
  return (
    <div className="page-head">
      <motion.div className="slate" {...item(0)}>{slate}</motion.div>
      <motion.h1 id={id} {...item(1)}>{title}</motion.h1>
      {lede && <motion.p className="lede" {...item(2)}>{lede}</motion.p>}
    </div>
  );
}

/** Rise-in with a small stagger index. */
export function Rise({ children, i = 0, className, style }: { children: ReactNode; i?: number; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} style={style}
      initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: Math.min(i, 20) * 0.04, ease: EASE }}>
      {children}
    </motion.div>
  );
}
