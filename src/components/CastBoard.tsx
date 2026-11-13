import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Tilt } from "@animate-ui/react/primitives/effects/tilt";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { CastCard } from "@/lib/types";
import { Modal } from "./Modal";
import { Reveal } from "./Motion";

const DEFAULT_CARDS: CastCard[] = [
  ["Asante", "Front desk at the nursing home. Always late, always asleep. The dreams are getting worse."],
  ["Gaia", "Asante's best friend. Former nurse who still treats people who can't afford a hospital."],
  ["Eli", "Twenty, loyal, and never far from his speaker."],
  ["David", "Sets up camp next to them in the shelter. Knows more than he says."],
  ["Sage", "Sixteen and furious, and she's not wrong."],
].map(([character, blurb], i) => ({ id: "local-" + i, character, blurb, actor_name: "", photo_path: null, sort_order: i + 1 }));
const STRINGS: [string, string][] = [["Asante", "Gaia"], ["Asante", "Eli"], ["Asante", "David"], ["Asante", "Sage"], ["Gaia", "Eli"], ["David", "Sage"]];
const TILT = [-3, 2.2, -1.4, 3.4, -2.6, 1.2, -3.8, 2.6, -1, 3, -2, 1.6];

const photoUrl = (path: string | null) => (supabase && path ? supabase.storage.from("headshots").getPublicUrl(path).data.publicUrl : null);

function PolaroidBody({ card, onLoad }: { card: CastCard; onLoad?: () => void }) {
  const url = photoUrl(card.photo_path);
  return (
    <>
      <span className="pin" aria-hidden="true" />
      <div className="photo">
        {url
          ? <img src={url} alt={(card.actor_name || card.character) + " as " + card.character} loading="lazy" onLoad={onLoad} />
          : <div className="silhouette" aria-hidden="true"><span>{card.character.slice(0, 1)}</span></div>}
      </div>
      <div className="cap">
        <span className="actor">{card.actor_name || "Casting…"}</span>
        <span className="role">as {card.character}</span>
      </div>
      {!card.actor_name && <span className="stamp">Open role</span>}
    </>
  );
}

interface Line { d: string; len: number }

export function CastBoard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const reduce = useReducedMotion();
  const [cards, setCards] = useState<CastCard[]>(DEFAULT_CARDS);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<CastCard | null>(null);
  const [editor, setEditor] = useState<{ card: CastCard | null } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const seen = useInView(boardRef, { once: true, margin: "0px 0px -15% 0px" });
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const load = useCallback(async () => {
    if (!supabase) { setCards(DEFAULT_CARDS); return; }
    const { data, error } = await supabase.from("cast_cards").select("*").order("sort_order").order("character");
    setCards(!error && data && data.length ? (data as CastCard[]) : DEFAULT_CARDS);
    if (error) setNote("Couldn't load the cast board, so this is the starter board. Has supabase/schema.sql been run?");
  }, []);
  useEffect(() => { load(); }, [load]);

  // Draw red string between pins, using layout positions (unaffected by the drop-in animation).
  const measure = useCallback(() => {
    const board = boardRef.current, grid = gridRef.current;
    if (!board || !grid) return;
    setSize({ w: board.offsetWidth, h: board.offsetHeight });
    const br = board.getBoundingClientRect();
    // measure the (untransformed) tilt wrapper so the drop-in animation and card rotation don't skew the pins
    const pin = (name: string): [number, number] | null => {
      const n = [...grid.querySelectorAll<HTMLElement>('[data-character]')].find(x => x.dataset.character === name);
      if (!n || !n.offsetWidth) return null;
      const r = n.getBoundingClientRect();
      return [r.left - br.left + r.width / 2, r.top - br.top - 1];
    };
    const next: Line[] = [];
    STRINGS.forEach(([a, b]) => {
      const p = pin(a), q = pin(b);
      if (!p || !q) return;
      const dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const mx = (p[0] + q[0]) / 2, my = Math.max(p[1], q[1]) + Math.min(60, dist * 0.12);
      next.push({ d: `M${p[0]} ${p[1]} Q${mx} ${my} ${q[0]} ${q[1]}`, len: dist });
    });
    setLines(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  useLayoutEffect(() => { measure(); }, [cards, editing, measure]);
  useEffect(() => {
    if (!boardRef.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <section aria-labelledby="cast-h" style={{ display: "grid", gap: 18 }}>
      <Reveal>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <div className="page-head"><div className="slate">Persons of interest</div><h2 id="cast-h">The cast</h2></div>
          {isAdmin && (
            <button className="btn small" type="button" aria-pressed={editing} onClick={() => { setEditing(!editing); setNote(!editing ? "Click a polaroid to edit or remove it. Lower order numbers come first." : ""); }}>
              {editing ? "Done editing" : "Edit the board"}
            </button>
          )}
        </div>
      </Reveal>
      <div className="board" ref={boardRef}>
        <svg className="strings" aria-hidden="true" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}>
          {lines.map((l, i) => (
            <motion.path key={i} d={l.d} initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={seen ? { pathLength: 1, opacity: 0.75 } : { pathLength: 0, opacity: 0 }}
              transition={{ duration: 1.3, delay: 0.9 + i * 0.12, ease: "easeOut" }} />
          ))}
        </svg>
        <div className="board-grid" ref={gridRef}>
          {cards.map((c, i) => {
            const r = TILT[i % TILT.length];
            return (
              <Tilt key={c.id} maxTilt={9} perspective={900} data-character={c.character}>
                <motion.button type="button" className="polaroid"
                  aria-label={c.actor_name ? c.actor_name + " as " + c.character : c.character + ", not cast yet"}
                  style={{ rotate: r }}
                  initial={reduce ? false : { opacity: 0, y: -60, rotate: r * 4, scale: 1.06 }}
                  animate={seen || reduce ? { opacity: 1, y: 0, rotate: r, scale: 1 } : undefined}
                  transition={{ type: "spring", stiffness: 130, damping: 13, delay: i * 0.085 + 0.1 }}
                  whileHover={{ rotate: 0, y: -8, scale: 1.04, transition: { type: "spring", stiffness: 300, damping: 18 } }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => (editing && isAdmin && !String(c.id).startsWith("local-") ? setEditor({ card: c }) : setOpen(c))}>
                  <PolaroidBody card={c} onLoad={measure} />
                </motion.button>
              </Tilt>
            );
          })}
          {isAdmin && editing && (
            <button type="button" className="board-add" onClick={() => setEditor({ card: null })}>+ Pin a new polaroid</button>
          )}
        </div>
      </div>
      <p className="hint">{note}</p>

      <Dossier card={open} isAdmin={isAdmin} onClose={() => setOpen(null)}
        onEdit={c => { setOpen(null); setEditor({ card: c }); }} onDeleted={() => { setOpen(null); load(); }} />
      <Editor state={editor} count={cards.length} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />
    </section>
  );
}

function Dossier({ card, isAdmin, onClose, onEdit, onDeleted }: { card: CastCard | null; isAdmin: boolean; onClose: () => void; onEdit: (c: CastCard) => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { setConfirm(false); setErr(""); }, [card]);
  const canEdit = isAdmin && !!card && !String(card.id).startsWith("local-");
  async function remove() {
    if (!card || !supabase) return;
    const { error } = await supabase.from("cast_cards").delete().eq("id", card.id);
    if (error) { setErr("Couldn't remove the card. Try again."); return; }
    if (card.photo_path) await supabase.storage.from("headshots").remove([card.photo_path]);
    onDeleted();
  }
  return (
    <Modal open={!!card} onOpenChange={o => !o && onClose()} slate="Case file" title={card?.character || ""} description="Cast member details">
      {card && (
        <>
          <div className="dossier">
            <div className="polaroid" style={{ position: "relative" }}><PolaroidBody card={card} /></div>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="mono muted">{card.actor_name ? "Played by " + card.actor_name : "Role not cast yet"}</div>
              <p style={{ margin: 0 }}>{card.blurb}</p>
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={onClose}>Close</button>
            <span style={{ flex: 1 }} />
            {canEdit && !confirm && (<>
              <button className="btn" type="button" onClick={() => onEdit(card)}>Edit</button>
              <button className="btn danger" type="button" onClick={() => setConfirm(true)}>Remove</button>
            </>)}
            {canEdit && confirm && (
              <span className="actions"><span className="hint">Take this card off the board?</span>
                <button className="btn danger small" type="button" onClick={remove}>Remove</button>
                <button className="btn small" type="button" onClick={() => setConfirm(false)}>Keep</button></span>
            )}
          </div>
          <div className="err" role="alert">{err}</div>
        </>
      )}
    </Modal>
  );
}

function Editor({ state, count, onClose, onSaved }: { state: { card: CastCard | null } | null; count: number; onClose: () => void; onSaved: () => void }) {
  const card = state?.card || null;
  const [f, setF] = useState({ character: "", actor: "", blurb: "", order: "" });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!state) return;
    setF({ character: card?.character || "", actor: card?.actor_name || "", blurb: card?.blurb || "", order: String(card ? card.sort_order : count + 1) });
    setFile(null); setErr("");
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!supabase) return;
    const character = f.character.trim();
    if (character.length < 2) { setErr("Add the character's name."); return; }
    if (file && file.size > 10 * 1024 * 1024) { setErr("That photo is over 10 MB. Pick a smaller one."); return; }
    const row = { character, actor_name: f.actor.trim(), blurb: f.blurb.trim(), sort_order: parseInt(f.order, 10) || 0 };
    setBusy(true);
    try {
      let id = card?.id;
      if (id) { const { error } = await supabase.from("cast_cards").update(row).eq("id", id); if (error) throw error; }
      else { const { data, error } = await supabase.from("cast_cards").insert(row).select("id").single(); if (error) throw error; id = data.id; }
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = id + "-" + Date.now() + "." + ext;
        const up = await supabase.storage.from("headshots").upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        const { error } = await supabase.from("cast_cards").update({ photo_path: path }).eq("id", id);
        if (error) throw error;
        if (card?.photo_path) await supabase.storage.from("headshots").remove([card.photo_path]);
      }
      onSaved();
    } catch (ex: any) { console.error(ex); setErr("Couldn't save: " + (ex.message || "try again") + "."); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={!!state} onOpenChange={o => !o && onClose()} slate="Board" title={card ? "Edit " + card.character : "Add a polaroid"}>
      <form style={{ display: "grid", gap: 16 }} onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="ed-char">Character</label><input type="text" id="ed-char" maxLength={60} value={f.character} onChange={e => setF({ ...f, character: e.target.value })} /></div>
        <div className="field"><label htmlFor="ed-actor">Actor's name</label><input type="text" id="ed-actor" maxLength={80} placeholder="Leave blank while casting" value={f.actor} onChange={e => setF({ ...f, actor: e.target.value })} /></div>
        <div className="field"><label htmlFor="ed-blurb">One or two lines about the character</label><textarea id="ed-blurb" maxLength={300} value={f.blurb} onChange={e => setF({ ...f, blurb: e.target.value })} /></div>
        <div className="row">
          <div className="field"><label htmlFor="ed-photo">Photo</label><input type="file" id="ed-photo" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setFile(e.target.files?.[0] || null)} /><span className="hint">Square photos look best. Up to 10 MB.</span></div>
          <div className="field" style={{ flex: "0 1 120px" }}><label htmlFor="ed-order">Order</label><input type="text" id="ed-order" inputMode="numeric" maxLength={3} value={f.order} onChange={e => setF({ ...f, order: e.target.value })} /></div>
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={busy}>{card ? "Save" : "Pin it"}</button>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <span className="err" role="alert">{err}</span>
        </div>
      </form>
    </Modal>
  );
}
