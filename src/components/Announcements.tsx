import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/useLive";
import { fmtDate } from "@/lib/format";
import type { Announcement } from "@/lib/types";
import { EASE, Reveal } from "./Motion";
import { Modal } from "./Modal";

export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    if (error) { console.error(error); setFailed(true); setLoaded(true); return; }
    setItems(data as Announcement[]); setFailed(false); setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(["announcements"], load);
  return { items, loaded, failed, reload: load };
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const toInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const upcoming = (a: Announcement) => !!a.meeting_at && new Date(a.meeting_at).getTime() > Date.now() - 2 * 3600e3;

export function AnnouncementCard({ a, i = 0, admin, onEdit, onDeleted, compact }: {
  a: Announcement; i?: number; admin?: boolean; onEdit?: (a: Announcement) => void; onDeleted?: () => void; compact?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  async function remove() {
    const { error } = await supabase!.from("announcements").delete().eq("id", a.id);
    if (error) { setErr("Couldn't delete it. Try again."); return; }
    onDeleted?.();
  }
  const live = upcoming(a) || !a.meeting_at;
  return (
    <motion.article className={"ann" + (a.pinned ? " pinned" : "")} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.05, ease: EASE }}>
      <div className="ann-top">
        <span className="meta">{fmtDate(a.created_at, { weekday: "short", month: "short", day: "numeric" })}</span>
        {a.pinned && <span className="tag on">Pinned</span>}
      </div>
      <h3>{a.title}</h3>
      {a.body && <p className="ann-body">{compact && a.body.length > 220 ? a.body.slice(0, 220).trimEnd() + "…" : a.body}</p>}
      {(a.meeting_at || a.meeting_link) && (
        <div className={"ann-meet" + (live ? "" : " past")}>
          <Video size={18} aria-hidden="true" />
          <div className="ann-when"><b>{live ? "Virtual meeting" : "Past meeting"}</b>{a.meeting_at && <span>{when(a.meeting_at)}</span>}</div>
          {a.meeting_link && <a className="btn small primary" href={a.meeting_link} target="_blank" rel="noopener noreferrer">Join meeting</a>}
        </div>
      )}
      {admin && (
        <div className="actions">
          <button className="btn small" type="button" onClick={() => onEdit?.(a)}>Edit</button>
          {confirm ? (
            <>
              <span className="hint">Delete for good?</span>
              <button className="btn small danger" type="button" onClick={remove}>Delete</button>
              <button className="btn small" type="button" onClick={() => setConfirm(false)}>Keep</button>
            </>
          ) : <button className="btn small danger" type="button" onClick={() => setConfirm(true)}>Delete</button>}
          <span className="err" role="alert">{err}</span>
        </div>
      )}
    </motion.article>
  );
}

export function AnnouncementForm({ initial, onDone, onCancel }: { initial?: Announcement; onDone: () => void; onCancel?: () => void }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ title: initial?.title || "", body: initial?.body || "", pinned: initial?.pinned || false, at: toInput(initial?.meeting_at ?? null), link: initial?.meeting_link || "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    const title = f.title.trim();
    let link = f.link.trim();
    if (title.length < 2) { setErr("Give the announcement a title."); return; }
    if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
    if (link && !/^https:\/\/[^\s.]+\.[^\s]+$/i.test(link)) { setErr("The meeting link needs to be a full https:// address."); return; }
    if (f.at && Number.isNaN(new Date(f.at).getTime())) { setErr("That meeting time doesn't look right."); return; }
    const row = { title, body: f.body.trim(), pinned: f.pinned, meeting_at: f.at ? new Date(f.at).toISOString() : null, meeting_link: link || null, updated_at: new Date().toISOString() };
    setBusy(true);
    const { error } = initial
      ? await supabase!.from("announcements").update(row).eq("id", initial.id)
      : await supabase!.from("announcements").insert({ ...row, created_by: profile!.id });
    setBusy(false);
    if (error) {
      console.error(error);
      setErr(/relation|schema cache/i.test(error.message) ? "Run supabase/announcements.sql in the Supabase SQL Editor first." : "Couldn't save: " + error.message);
      return;
    }
    if (!initial) setF({ title: "", body: "", pinned: false, at: "", link: "" });
    onDone();
  }
  const id = initial?.id || "new";
  return (
    <form className="field" style={{ gap: 14 }} noValidate onSubmit={submit}>
      <div className="field"><label htmlFor={"an-t-" + id}>Title</label><input type="text" id={"an-t-" + id} maxLength={120} placeholder="Table read moved to Thursday" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label htmlFor={"an-b-" + id}>Message (optional)</label><textarea id={"an-b-" + id} maxLength={4000} placeholder="What does everyone need to know?" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></div>
      <div className="row" style={{ alignItems: "start" }}>
        <div className="field">
          <label htmlFor={"an-l-" + id}>Virtual meeting link (optional)</label>
          <input type="url" id={"an-l-" + id} maxLength={500} placeholder="https://meet.google.com/…" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} />
          <span className="hint">Zoom, Google Meet, Teams, anything with a link.</span>
        </div>
        <div className="field" style={{ flex: "0 1 260px" }}>
          <label htmlFor={"an-a-" + id}>Meeting time (optional)</label>
          <input type="datetime-local" id={"an-a-" + id} value={f.at} onChange={e => setF({ ...f, at: e.target.value })} />
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={f.pinned} onChange={e => setF({ ...f, pinned: e.target.checked })} /> Pin to the top</label>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Post announcement"}</button>
        {onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}
        <span className="err" role="alert">{err}</span>
      </div>
    </form>
  );
}

/** Announcements section for the home page. Approved members see it; admins can post, edit and delete here. */
export function AnnouncementsSection() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { items, loaded, failed, reload } = useAnnouncements();
  const [composing, setComposing] = useState(false);
  const [edit, setEdit] = useState<Announcement | null>(null);
  const [all, setAll] = useState(false);
  if (!profile?.member) return null;
  if (!isAdmin && (!loaded || failed || !items.length)) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section id="announcements" aria-labelledby="ann-h" style={{ display: "grid", gap: 14, scrollMarginTop: 80 }}>
      <Reveal>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <div className="page-head"><div className="slate">From the producers</div><h2 id="ann-h">Announcements</h2></div>
          {isAdmin && <button className="btn small primary" type="button" onClick={() => setComposing(c => !c)}>{composing ? "Close" : "+ New announcement"}</button>}
        </div>
      </Reveal>
      <AnimatePresence initial={false}>
        {isAdmin && composing && (
          <motion.div key="compose" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="panel corner">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h3>New announcement</h3><span className="admin-badge">Admin</span></div>
              <AnnouncementForm onDone={() => { setComposing(false); reload(); }} onCancel={() => setComposing(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {failed && isAdmin && <div className="notice bad">Couldn't load announcements. Run supabase/announcements.sql in the Supabase SQL Editor, then refresh.</div>}
      {loaded && !failed && !items.length && <p className="empty">Nothing yet. Post the first announcement above.</p>}
      <div className="anns"><AnimatePresence initial={false}>{shown.map((a, i) => <AnnouncementCard key={a.id} a={a} i={i} admin={isAdmin} onEdit={setEdit} onDeleted={reload} />)}</AnimatePresence></div>
      {items.length > 3 && <div><button className="btn small" type="button" onClick={() => setAll(v => !v)}>{all ? "Show fewer" : "Show all " + items.length}</button></div>}
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} slate="Announcement" title="Edit announcement" wide>
        {edit && <AnnouncementForm key={edit.id} initial={edit} onCancel={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
      </Modal>
    </section>
  );
}
