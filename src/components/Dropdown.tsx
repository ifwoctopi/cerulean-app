import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { EASE } from "./Motion";

export interface Option { value: string; label: string }

/**
 * A dropdown that opens downward (flipping up only when there's no room below), with a capped height
 * and its own scrolling. Replaces the native select so the list never covers the fields above it.
 */
export function Dropdown({ id, value, onChange, options, placeholder = "Choose…", label }: {
  id?: string; value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; label?: string;
}) {
  const uid = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number }>({ left: 0, width: 0, max: 260 });
  const selected = options.find(o => o.value === value);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 180 && above > below;
    setPos(up
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, max: Math.min(260, above) }
      : { left: r.left, width: r.width, top: r.bottom + 4, max: Math.min(260, below) });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const scroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", place); };
  }, [open, place]);
  useEffect(() => { // keep the highlighted option in view
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() { setActive(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true); }
  function choose(i: number) { onChange(options[i].value); setOpen(false); btn.current?.focus(); }
  function key(e: KeyboardEvent) {
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) { const i = options.findIndex(o => o.label.toLowerCase().startsWith(e.key.toLowerCase())); if (i >= 0) setActive(i); }
  }
  const dropUp = pos.bottom !== undefined;
  return (
    <>
      <button ref={btn} id={id} type="button" className="dd-btn" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={uid} aria-label={label}
        aria-activedescendant={open ? `${uid}-${active}` : undefined} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={key}>
        <span className={selected ? "" : "dd-ph"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={list} id={uid} role="listbox" className="dd-list" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.max, transformOrigin: dropUp ? "bottom" : "top" }}
              initial={{ opacity: 0, y: dropUp ? 6 : -6, scaleY: 0.96 }} animate={{ opacity: 1, y: 0, scaleY: 1 }} exit={{ opacity: 0, y: dropUp ? 4 : -4, scaleY: 0.97 }} transition={{ duration: 0.16, ease: EASE }}>
              {options.map((o, i) => (
                <div key={o.value} id={`${uid}-${i}`} data-i={i} role="option" aria-selected={o.value === value} className={"dd-opt" + (i === active ? " active" : "") + (o.value === value ? " sel" : "")}
                  onPointerEnter={() => setActive(i)} onClick={() => choose(i)}>{o.label}</div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </>
  );
}
