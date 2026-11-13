import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

export interface HelixPhoto { id: string; url: string; caption: string; label: string; frame: string }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * A 3D helix of photos. The page scrolls through the spiral (sticky stage + scroll progress),
 * and you can also drag sideways or use the arrow keys. Items fade out as they leave the front.
 */
export function Helix({ photos, onOpen }: { photos: HelixPhoto[]; onOpen: (i: number) => void }) {
  const n = photos.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 640 });
  const [front, setFront] = useState(0);

  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // geometry, scaled to the stage
  const perTurn = box.w < 560 ? 8 : 12;
  const itemW = clamp(box.w * 0.15, 100, 170);
  const itemH = Math.round(itemW * 1.3);
  const radius = (itemW * 1.5 * perTurn) / (2 * Math.PI);
  const stepDeg = 360 / perTurn;
  const pitch = (itemH * 1.3) / perTurn;

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const drag = useMotionValue(0);
  const raw = useTransform([scrollYProgress, drag], ([s, d]: number[]) => clamp(s * (n - 1) + d, 0, n - 1));
  const p = useSpring(raw, { stiffness: 90, damping: 22, mass: 0.7 });
  const rotateY = useTransform(p, v => -v * stepDeg);
  const y = useTransform(p, v => -v * pitch);
  useMotionValueEvent(p, "change", v => { const r = Math.round(v); setFront(f => (f === r ? f : r)); });

  // drag sideways to spin (vertical gestures stay as page scroll)
  const start = useRef<{ x: number; d: number; moved: number } | null>(null);
  const suppress = useRef(false);
  function down(e: PointerEvent) { if (e.pointerType === "mouse" && e.button !== 0) return; start.current = { x: e.clientX, d: drag.get(), moved: 0 }; }
  function move(e: PointerEvent) {
    const s = start.current; if (!s) return;
    const dx = e.clientX - s.x; s.moved = Math.max(s.moved, Math.abs(dx));
    if (s.moved > 6) drag.set(clamp(s.d - dx / 95, -(n - 1), n - 1));
  }
  function up() { suppress.current = (start.current?.moved ?? 0) > 6; start.current = null; setTimeout(() => (suppress.current = false), 0); }
  function key(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); animate(drag, clamp(drag.get() + 1, -(n - 1), n - 1), { type: "spring", stiffness: 200, damping: 26 }); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); animate(drag, clamp(drag.get() - 1, -(n - 1), n - 1), { type: "spring", stiffness: 200, damping: 26 }); }
  }
  function bringToFront(i: number) { animate(drag, i - scrollYProgress.get() * (n - 1), { type: "spring", stiffness: 160, damping: 24 }); }

  const cur = photos[clamp(front, 0, n - 1)];
  return (
    <div ref={trackRef} className="helix-track" style={{ height: `calc(100vh + ${n * 80}px)` }}>
      <div ref={stageRef} className="helix-sticky" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        role="group" aria-label="Photo helix. Scroll, drag, or use the arrow keys to move through the photos.">
        <div className="helix-hint">Scroll or drag to travel the helix</div>
        <motion.div className="helix-axis" style={{ rotateY, y, z: -radius }}>
          {photos.map((ph, i) => (
            <HelixItem key={ph.id} i={i} photo={ph} p={p} w={itemW} h={itemH} radius={radius} stepDeg={stepDeg} pitch={pitch} stageH={box.h}
              onActivate={() => { if (suppress.current) return; onOpen(i); }} onFocusItem={() => bringToFront(i)} />
          ))}
        </motion.div>
        {cur && (
          <div className="helix-hud" aria-live="polite">
            <div><div className="meta">{cur.frame} · {cur.label}</div><div className="cap">{cur.caption}</div></div>
            <div className="meta">{clamp(front, 0, n - 1) + 1} / {n}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const HelixItem = memo(function HelixItem({ i, photo, p, w, h, radius, stepDeg, pitch, stageH, onActivate, onFocusItem }: {
  i: number; photo: HelixPhoto; p: MotionValue<number>; w: number; h: number; radius: number; stepDeg: number; pitch: number; stageH: number; onActivate: () => void; onFocusItem: () => void;
}) {
  const facing = (v: number) => (Math.cos(((i - v) * stepDeg * Math.PI) / 180) + 1) / 2; // 1 = front, 0 = back
  const vertical = (v: number) => 1 - clamp(Math.abs((i - v) * pitch) / (stageH * 0.58), 0, 1);
  const opacity = useTransform(p, v => clamp((0.1 + 0.9 * facing(v) ** 2) * vertical(v) ** 1.2, 0, 1));
  const filter = useTransform(p, v => `brightness(${0.35 + 0.65 * facing(v)})`);
  const pointerEvents = useTransform(p, v => (facing(v) * vertical(v) > 0.55 ? "auto" : "none"));
  return (
    // plain div holds the fixed spot on the spiral; the button inside animates (fade, hover)
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transformStyle: "preserve-3d",
      transform: `rotateY(${i * stepDeg}deg) translateZ(${radius}px) translateY(${i * pitch}px)` }}>
      <motion.button type="button" className="helix-item" aria-label={"Open " + photo.frame + (photo.caption ? ": " + photo.caption : "")}
        style={{ width: "100%", height: "100%", position: "relative", opacity, filter, pointerEvents }}
        whileHover={{ scale: 1.06 }} onClick={onActivate} onFocus={onFocusItem}>
        <img src={photo.url} alt={photo.caption || "Photo from set"} loading="lazy" draggable={false} />
      </motion.button>
    </div>
  );
});
