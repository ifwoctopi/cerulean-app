import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { Photo } from "@/lib/types";
import { Filter } from "@/components/Filter";
import { Helix, type HelixPhoto } from "@/components/Helix";
import { Modal } from "@/components/Modal";
import { EASE, PageHead, Reveal } from "@/components/Motion";

interface DayRow { id: string; day_label: string; shoot_date: string; title: string }

export default function Gallery() {
  const { profile } = useAuth();
  const reduce = useReducedMotion();
  const isAdmin = profile!.role === "admin";
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"helix" | "grid">(reduce ? "grid" : "helix");
  const [loaded, setLoaded] = useState(false); const [loadErr, setLoadErr] = useState(false);
  const [cur, setCur] = useState<number | null>(null);
  const [dirn, setDirn] = useState(1);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [g, d] = await Promise.all([
      supabase.from("gallery_photos").select("*").order("taken_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      supabase.from("shoot_days").select("id, day_label, shoot_date, title").order("sort_order"),
    ]);
    if (g.error || d.error) { console.error(g.error || d.error); setLoadErr(true); setLoaded(true); return; }
    const list = g.data as Photo[];
    setPhotos(list); setDays(d.data as DayRow[]);
    const need = list.map(p => p.file_path);
    const next: Record<string, string> = {};
    for (let i = 0; i < need.length; i += 100) {
      const { data } = await supabase.storage.from("gallery").createSignedUrls(need.slice(i, i + 100), 60 * 60 * 6);
      (data || []).forEach(x => { if (x.signedUrl && x.path) next[x.path] = x.signedUrl; });
    }
    setUrls(next); setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dayName = (id: string | null) => { const d = days.find(x => x.id === id); return d ? d.day_label + " · " + fmtDate(d.shoot_date, { month: "short", day: "numeric" }) : ""; };
  const filterOpts = useMemo(() => {
    const used = new Set(photos.map(p => p.shoot_day).filter(Boolean));
    const o: [string, string][] = [["all", "All"], ...days.filter(d => used.has(d.id)).map(d => [d.id, dayName(d.id)] as [string, string])];
    if (photos.some(p => !p.shoot_day)) o.push(["none", "Other"]);
    return o;
  }, [photos, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = photos.filter(p => filter === "all" || (filter === "none" ? !p.shoot_day : p.shoot_day === filter));
  const frameNo = (p: Photo) => "FR " + String(photos.length - photos.indexOf(p)).padStart(3, "0");
  const helixPhotos: HelixPhoto[] = shown.filter(p => urls[p.file_path]).map(p => ({
    id: p.id, url: urls[p.file_path], caption: p.caption, frame: frameNo(p), label: p.shoot_day ? dayName(p.shoot_day) : p.taken_on ? fmtDate(p.taken_on) : "On set",
  }));

  const open = (i: number) => { setDirn(1); setCur(i); };
  const step = useCallback((d: number) => setCur(c => { if (c === null) return c; const n = c + d; if (n < 0 || n >= shown.length) return c; setDirn(d); return n; }), [shown.length]);
  useEffect(() => {
    if (cur === null) return;
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [cur, step]);

  return (
    <main className="page" id="main">
      <PageHead slate="Behind the scenes" title="On set" lede="Photos of us making Cerulean. Only people signed in to the site can see them." />
      {isAdmin && <Uploader days={days} profileId={profile!.id} onDone={load} />}

      <section style={{ display: "grid", gap: 16 }} aria-labelledby="g-h">
        <Reveal>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
            <h2 id="g-h">{view === "helix" ? "The helix" : "Contact sheet"}</h2>
            <div className="actions">
              <span className="meta">{photos.length ? shown.length + " of " + photos.length + " frames" : ""}</span>
              <div className="view-toggle" role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === "helix"} onClick={() => setView("helix")}>Helix</button>
                <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button>
              </div>
            </div>
          </div>
        </Reveal>
        {photos.length > 0 && <Filter value={filter} onChange={setFilter} options={filterOpts} />}

        {!loaded && <p className="empty">Loading…</p>}
        {loadErr && <div className="notice bad">Couldn't load the photos. Make sure the latest supabase/schema.sql has been run.</div>}
        {loaded && !loadErr && !shown.length && <p className="empty">{photos.length ? "No photos for this day yet." : isAdmin ? "No photos yet. Add the first ones above." : "No photos yet. Check back once we start shooting."}</p>}

        {shown.length > 0 && (
          <AnimatePresence mode="wait" initial={false}>
            {view === "helix" && helixPhotos.length >= 3 ? (
              <motion.div key={"helix-" + filter} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
                <Helix photos={helixPhotos} onOpen={i => open(shown.findIndex(p => p.id === helixPhotos[i].id))} />
              </motion.div>
            ) : (
              <motion.div key={"grid-" + filter} className="contact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {shown.map((p, i) => (
                  <motion.button key={p.id} className="frame" type="button" aria-label={"Open photo " + (photos.length - photos.indexOf(p)) + (p.caption ? ": " + p.caption : "")}
                    initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: Math.min(i, 24) * 0.045, ease: EASE }}
                    whileHover={{ y: -4 }} onClick={() => open(i)}>
                    <img src={urls[p.file_path] || undefined} alt={p.caption || "Photo from set"} loading="lazy" />
                    <div className="fmeta"><span className="fno">{frameNo(p)}</span><span>{p.shoot_day ? dayName(p.shoot_day) : p.taken_on ? fmtDate(p.taken_on) : ""}</span></div>
                    {p.caption && <div className="fcap">{p.caption}</div>}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </section>

      <Lightbox photos={shown} urls={urls} index={cur} dirn={dirn} isAdmin={isAdmin} dayName={dayName}
        onClose={() => setCur(null)} onStep={step}
        onChanged={async removedLast => { await load(); if (removedLast) setCur(null); }} />
    </main>
  );
}

function Lightbox({ photos, urls, index, dirn, isAdmin, dayName, onClose, onStep, onChanged }: {
  photos: Photo[]; urls: Record<string, string>; index: number | null; dirn: number; isAdmin: boolean; dayName: (id: string | null) => string;
  onClose: () => void; onStep: (d: number) => void; onChanged: (removedLast: boolean) => Promise<void>;
}) {
  const p = index !== null ? photos[index] : undefined;
  const [editing, setEditing] = useState(false); const [cap, setCap] = useState(""); const [confirm, setConfirm] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { setEditing(false); setConfirm(false); setErr(""); }, [p?.id]);
  async function saveCap(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase!.from("gallery_photos").update({ caption: cap.trim() }).eq("id", p!.id);
    if (error) { setErr("Couldn't save the caption."); return; }
    setEditing(false); onChanged(false);
  }
  async function del() {
    const { error } = await supabase!.from("gallery_photos").delete().eq("id", p!.id);
    if (error) { setErr("Couldn't delete it. Try again."); return; }
    await supabase!.storage.from("gallery").remove([p!.file_path]);
    onChanged(photos.length <= 1);
  }
  return (
    <Modal open={index !== null && !!p} onOpenChange={o => !o && onClose()} wide title={p ? "Frame " + (index! + 1) + " of " + photos.length : ""} description="Photo from set">
      {p && (
        <>
          <div className="lb-stage">
            <button className="btn small lb-nav prev" type="button" aria-label="Previous photo" disabled={index === 0} onClick={() => onStep(-1)}>←</button>
            <AnimatePresence mode="popLayout" initial={false} custom={dirn}>
              <motion.img key={p.id} src={urls[p.file_path] || undefined} alt={p.caption || "Photo from set"} custom={dirn}
                initial={{ opacity: 0, x: dirn * 60, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: dirn * -60, scale: 0.97 }} transition={{ duration: 0.35, ease: EASE }} />
            </AnimatePresence>
            <button className="btn small lb-nav next" type="button" aria-label="Next photo" disabled={index === photos.length - 1} onClick={() => onStep(1)}>→</button>
          </div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ display: "grid", gap: 4, minWidth: 0, flex: "1 1 300px" }}>
              <div className="meta">{"Frame " + (index! + 1) + " of " + photos.length + (p.shoot_day ? " · " + dayName(p.shoot_day) : "") + (p.taken_on ? " · " + fmtDate(p.taken_on) : "")}</div>
              <div>{p.caption}</div>
            </div>
            <div className="actions">
              {isAdmin && (<>
                <button className="btn small" type="button" onClick={() => { setEditing(true); setCap(p.caption || ""); }}>Edit caption</button>
                <button className="btn small danger" type="button" onClick={() => setConfirm(true)}>Delete</button>
              </>)}
              <button className="btn small" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
          {editing && (
            <form className="row" noValidate onSubmit={saveCap}>
              <div className="field"><label htmlFor="lb-capin">Caption</label><input type="text" id="lb-capin" maxLength={200} autoFocus value={cap} onChange={e => setCap(e.target.value)} /></div>
              <button className="btn small primary" type="submit">Save</button>
            </form>
          )}
          {confirm && (
            <div className="actions"><span className="hint">Delete this photo for good?</span>
              <button className="btn small danger" type="button" onClick={del}>Delete</button><button className="btn small" type="button" onClick={() => setConfirm(false)}>Keep</button></div>
          )}
          <div className="err" role="alert">{err}</div>
        </>
      )}
    </Modal>
  );
}

function Uploader({ days, profileId, onDone }: { days: DayRow[]; profileId: string; onDone: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [day, setDay] = useState(""); const [date, setDate] = useState(""); const [cap, setCap] = useState("");
  const [ok, setOk] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    if (!files.length) { setErr("Choose at least one photo."); return; }
    const big = files.filter(f => f.size > 15 * 1024 * 1024);
    if (big.length) { setErr(big.map(f => f.name).join(", ") + (big.length > 1 ? " are" : " is") + " over 15 MB. Leave those out or shrink them."); return; }
    setBusy(true); setDone(0);
    const failed: string[] = []; let n = 0;
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = (day || "misc") + "/" + crypto.randomUUID() + "." + ext;
      const up = await supabase!.storage.from("gallery").upload(path, f, { contentType: f.type || "image/jpeg" });
      if (up.error) failed.push(f.name);
      else {
        const { error } = await supabase!.from("gallery_photos").insert({ file_path: path, caption: cap.trim(), taken_on: date || null, shoot_day: day || null, uploaded_by: profileId });
        if (error) { failed.push(f.name); await supabase!.storage.from("gallery").remove([path]); }
      }
      n++; setDone(n);
    }
    setBusy(false);
    const okCount = files.length - failed.length;
    if (okCount) setOk("Added " + okCount + " photo" + (okCount > 1 ? "s" : "") + ".");
    if (failed.length) setErr("Couldn't upload: " + failed.join(", ") + ".");
    setFiles([]); setCap(""); (document.getElementById("g-files") as HTMLInputElement | null)?.form?.reset();
    onDone();
  }
  return (
    <Reveal>
      <form className="panel corner" noValidate onSubmit={submit}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h2>Add photos</h2><span className="admin-badge">Admin</span></div>
        <div className="field"><label htmlFor="g-files">Photos</label><input type="file" id="g-files" accept="image/*" multiple onChange={e => setFiles([...(e.target.files || [])])} /><span className="hint">Pick as many as you like. JPEG, PNG, WebP, GIF or HEIC, up to 15 MB each.</span></div>
        <div className="row">
          <div className="field"><label htmlFor="g-day">Shoot day</label>
            <select id="g-day" value={day} onChange={e => { setDay(e.target.value); const d = days.find(x => x.id === e.target.value); if (d && !date) setDate(d.shoot_date); }}>
              <option value="">Not tied to a shoot day</option>
              {days.map(d => <option key={d.id} value={d.id}>{d.day_label + " · " + fmtDate(d.shoot_date, { month: "short", day: "numeric" }) + " · " + d.title}</option>)}
            </select></div>
          <div className="field" style={{ flex: "0 1 200px" }}><label htmlFor="g-date">Date taken</label><input type="date" id="g-date" value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="g-cap">Caption (optional, used for every photo in this batch)</label><input type="text" id="g-cap" maxLength={200} placeholder="Lighting the lab for scene 33" value={cap} onChange={e => setCap(e.target.value)} /></div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? `Uploading ${Math.min(done + 1, files.length)} of ${files.length}…` : "Upload"}</button>
          <span className="toast" role="status" aria-live="polite">{ok}</span><span className="err" role="alert">{err}</span>
        </div>
        {busy && <div className="progress"><motion.i initial={{ width: 0 }} animate={{ width: (done / Math.max(1, files.length)) * 100 + "%" }} /></div>}
      </form>
    </Reveal>
  );
}
