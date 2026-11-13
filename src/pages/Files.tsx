import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fmtBytes, fmtDate } from "@/lib/format";
import type { DocRow } from "@/lib/types";
import { Filter } from "@/components/Filter";
import { EASE, PageHead, Reveal } from "@/components/Motion";

const CATS: Record<string, string> = { meeting_notes: "Meeting notes", chart: "Charts", schedule: "Schedules", script: "Scripts", call_sheet: "Call sheets", other: "Other" };
const TYPES: [string, string][] = [["meeting_notes", "Meeting notes"], ["chart", "Chart"], ["schedule", "Schedule"], ["script", "Script"], ["call_sheet", "Call sheet"], ["other", "Other"]];
const ext = (d: DocRow) => { const m = /\.([a-z0-9]{1,5})$/i.exec(d.file_name); return m ? m[1].toUpperCase() : "FILE"; };

export default function Files() {
  const { profile } = useAuth();
  const isAdmin = profile!.role === "admin";
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); const [loadErr, setLoadErr] = useState(false);
  const [f, setF] = useState({ title: "", cat: "meeting_notes", date: "", desc: "" });
  const [file, setFile] = useState<File | null>(null);
  const [ok, setOk] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
    if (error) { setLoadErr(true); setLoaded(true); return; }
    setDocs(data as DocRow[]); setLoaded(true);
    const ids = [...new Set((data as DocRow[]).map(d => d.uploaded_by).filter(Boolean))] as string[];
    if (ids.length) { const r = await supabase.from("profiles").select("id, full_name").in("id", ids); const m: Record<string, string> = {}; (r.data || []).forEach((p: any) => (m[p.id] = p.full_name)); setNames(m); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = docs.filter(d => (cat === "all" || d.category === cat) && (!q.trim() || (d.title + " " + d.description + " " + d.file_name).toLowerCase().includes(q.trim().toLowerCase())));

  async function open(d: DocRow) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase!.storage.from("documents").createSignedUrl(d.file_path, 60 * 10);
    if (error) { w?.close(); setErr("Couldn't open that file. It may have been removed."); return; }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }
  async function remove(d: DocRow) {
    const st = await supabase!.storage.from("documents").remove([d.file_path]);
    const { error } = await supabase!.from("documents").delete().eq("id", d.id);
    if (error || st.error) { setErr("Couldn't delete it. Try again."); return; }
    setConfirmId(null); setDocs(docs.filter(x => x.id !== d.id));
  }
  async function upload(e: FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    const title = f.title.trim();
    if (title.length < 2) { setErr("Give it a title."); return; }
    if (!file) { setErr("Choose a file to upload."); return; }
    if (file.size > 50 * 1024 * 1024) { setErr("That file is over 50 MB. Compress it or split it up."); return; }
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);
    const path = f.cat + "/" + new Date().getFullYear() + "/" + crypto.randomUUID() + "-" + safe;
    setBusy(true);
    try {
      const up = await supabase!.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) throw up.error;
      const { error } = await supabase!.from("documents").insert({
        title, category: f.cat, meeting_date: f.cat === "meeting_notes" && f.date ? f.date : null, description: f.desc.trim(),
        file_path: path, file_name: file.name, mime_type: file.type || "", size_bytes: file.size, uploaded_by: profile!.id,
      });
      if (error) { await supabase!.storage.from("documents").remove([path]); throw error; }
      setF({ title: "", cat: "meeting_notes", date: "", desc: "" }); setFile(null); (document.getElementById("f-file") as HTMLInputElement | null)?.form?.reset();
      setOk("Uploaded."); load();
    } catch (ex: any) { console.error(ex); setErr("Couldn't upload: " + (ex.message || "try again") + "."); }
    finally { setBusy(false); }
  }

  return (
    <main className="page" id="main">
      <PageHead slate="Production meetings" title="Past meetings" lede="Notes from past meetings, plus the charts, schedules, script drafts and call sheets that came out of them. Everyone signed in can open these. Only admins can add or remove them." />

      {isAdmin && (
        <Reveal>
          <form className="panel corner" noValidate onSubmit={upload}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h2>Add a file</h2><span className="admin-badge">Admin</span></div>
            <div className="row">
              <div className="field"><label htmlFor="f-title">Title</label><input type="text" id="f-title" maxLength={120} placeholder="Production meeting, Nov 10" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
              <div className="field" style={{ flex: "0 1 220px" }}><label htmlFor="f-cat">Type</label>
                <select id="f-cat" value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}>
                  {TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <AnimatePresence initial={false}>
                {f.cat === "meeting_notes" && (
                  <motion.div className="field" style={{ flex: "0 1 200px" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                    <label htmlFor="f-date">Meeting date</label><input type="date" id="f-date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="field"><label htmlFor="f-desc">What's in it? (optional)</label><textarea id="f-desc" maxLength={600} placeholder="Decisions, who was there, what's next…" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} /></div>
            <div className="field"><label htmlFor="f-file">File</label><input type="file" id="f-file" onChange={e => setFile(e.target.files?.[0] || null)} /><span className="hint">PDFs, images, Word, Excel, slides, anything up to 50 MB.</span></div>
            <div className="actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button><span className="toast" role="status">{ok}</span><span className="err" role="alert">{err}</span></div>
          </form>
        </Reveal>
      )}

      <section style={{ display: "grid", gap: 16 }} aria-labelledby="list-h">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <h2 id="list-h">Everything on file</h2>
          <div className="field" style={{ flex: "0 1 280px" }}><label htmlFor="q">Search</label><input type="search" id="q" placeholder="Title or description" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <Filter value={cat} onChange={setCat} options={[["all", "All"], ...Object.entries(CATS)] as [string, string][]} />
        {!isAdmin && err && <div className="err">{err}</div>}
        <div className="files">
          {!loaded && <p className="empty">Loading…</p>}
          {loadErr && <div className="notice bad">Couldn't load files. Make sure supabase/schema.sql has been run.</div>}
          {loaded && !loadErr && !list.length && <p className="empty">{docs.length ? "Nothing matches." : isAdmin ? "Nothing on file yet. Upload the first meeting notes above." : "Nothing on file yet."}</p>}
          <AnimatePresence initial={false}>
            {list.map((d, i) => {
              const meta = [CATS[d.category], d.meeting_date ? "Meeting " + fmtDate(d.meeting_date) : null, fmtBytes(d.size_bytes), "Added " + fmtDate(d.created_at) + (names[d.uploaded_by || ""] ? " by " + names[d.uploaded_by || ""] : "")].filter(Boolean).join(" · ");
              return (
                <motion.div key={d.id} className="file" layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.04, ease: EASE }}>
                  <div className="ext" aria-hidden="true">{ext(d)}</div>
                  <div style={{ minWidth: 0 }}><div className="t">{d.title}</div><div className="m">{meta}</div>{d.description && <div className="d">{d.description}</div>}</div>
                  <div className="actions">
                    <button className="btn small" type="button" onClick={() => open(d)}>Open</button>
                    {isAdmin && (confirmId === d.id ? (<>
                      <span className="hint">Delete for good?</span>
                      <button className="btn small danger" type="button" onClick={() => remove(d)}>Delete</button>
                      <button className="btn small" type="button" onClick={() => setConfirmId(null)}>Keep</button>
                    </>) : <button className="btn small danger" type="button" onClick={() => setConfirmId(d.id)}>Delete</button>)}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
