import { useId } from "react";
import { motion } from "motion/react";

/** Pill buttons with a highlight that slides between the options. */
export function Filter<T extends string>({ options, value, onChange, label = "Show" }: { options: [T, string][]; value: T; onChange: (v: T) => void; label?: string }) {
  const id = useId();
  return (
    <div className="filter" role="group" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} type="button" className="btn small" aria-pressed={value === k} onClick={() => onChange(k)}>
          {value === k && <motion.span layoutId={"pill-" + id} className="pill-hl" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
