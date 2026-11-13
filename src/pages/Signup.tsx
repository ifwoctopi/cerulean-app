import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { supabase, connected } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { EMAIL_RE } from "@/lib/format";
import { EASE, PageHead } from "@/components/Motion";
import { Dropdown } from "@/components/Dropdown";
import { ResendLink } from "@/components/ResendLink";

const CAST = ["Asante", "Gaia", "Eli", "David", "Sage", "Remy", "Michaela", "Tia", "Veronica", "Caught Scientist", "Perceptron Rep", "Asante's Dad", "Ava", "Cole", "Truck Driver", "Random Man", "Random (bathroom)", "Food Runner 1", "Food Runner 2", "Food Runner 3"];
const JOBS = ["Director", "Producer", "Assistant director", "Director of photography", "Camera operator", "Camera assistant", "Gaffer / lighting", "Grip", "Sound", "Hair & makeup", "Wardrobe", "Production design", "Props", "Script supervisor", "Production assistant", "Editor", "VFX", "Photographer / BTS", "Other"];
const card = { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -14 }, transition: { duration: 0.4, ease: EASE } };

export default function Signup() {
  const { session, loading } = useAuth();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [dept, setDept] = useState<"cast" | "crew">("cast");
  const [chars, setChars] = useState<string[]>([]);
  const [job, setJob] = useState(""); const [jobOther, setJobOther] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState("");

  // Returns an error message, or null when the email was sent. Used for the first send and for "resend".
  async function sendSignup(addr: string, n: string, finalJob: string): Promise<string | null> {
    if (!supabase) return "Not connected.";
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + "/calendar",
        data: { full_name: n, department: dept, characters: dept === "cast" ? chars : [], job: dept === "crew" ? finalJob : "" } },
    });
    if (!error) return null;
    return /signups? not allowed|disabled/i.test(error.message) ? "Sign-ups are switched off right now. Ask the producer to invite you."
      : /rate|seconds/i.test(error.message) ? "Too many tries. Wait a minute, then try again." : "Couldn't sign you up: " + error.message;
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    const n = name.trim(), addr = email.trim();
    const finalJob = job === "Other" ? jobOther.trim() : job;
    if (n.length < 2) { setErr("Add your name."); return; }
    if (!EMAIL_RE.test(addr)) { setErr("Enter a full email address."); return; }
    if (dept === "cast" && !chars.length) { setErr("Pick who you play."); return; }
    if (dept === "crew" && finalJob.length < 2) { setErr(job === "Other" ? "Type your job." : "Choose your job."); return; }
    setBusy(true);
    const problem = await sendSignup(addr, n, finalJob);
    setBusy(false);
    if (problem) { setErr(problem); return; }
    setSent(addr);
  }

  return (
    <main className="page">
      <div className="signup-grid">
        <section className="signup-pitch" aria-labelledby="su-h">
          <PageHead slate="Cast & crew call" title="Join the production" id="su-h"
            lede="Sign up once and you'll be able to mark which dates you can make on the calendar and see the schedule, set photos and meeting notes." />
          <ol className="steps">
            {["Tell us who you are.|Cast picks who they play. Crew picks their job.", "Open the link we email you.|No password needed.", "Wait for the producer to approve you.|Then you can mark your dates on the calendar."].map((s, i) => {
              const [b, t] = s.split("|");
              return <motion.li key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.4 + i * 0.12, ease: EASE }}><span><b>{b}</b> {t}</span></motion.li>;
            })}
          </ol>
          <p className="hint">Already signed up? <Link to="/login">Sign in instead</Link>.</p>
        </section>

        <AnimatePresence mode="wait">
          {!connected ? (
            <motion.div key="noconn" className="panel" {...card}>
              <div className="slate">No signal</div><h2>Sign-up isn't connected yet</h2>
              <p style={{ margin: 0 }}>The producer still needs to connect this site to its database. Check back soon.</p>
            </motion.div>
          ) : loading ? null : session ? (
            <motion.div key="already" className="panel corner" {...card}>
              <div className="slate">You're in</div><h2>Already signed in</h2>
              <p style={{ margin: 0 }}>You're signed in as {session.user.email}.</p>
              <div className="actions"><Link className="btn primary" to="/calendar">Open the calendar</Link></div>
            </motion.div>
          ) : sent ? (
            <motion.div key="sent" className="panel corner" {...card}>
              <div className="slate">Check your inbox</div><h2>Almost there</h2>
              <p style={{ margin: 0 }}>We sent a link to <b>{sent}</b>. Open it on this device to finish signing up.</p>
              <p className="hint" style={{ margin: 0 }}>After that, the producer approves you, usually within a day. You'll be able to mark your dates as soon as they do. Already had an account? The link just signs you in.</p>
              <ResendLink send={() => sendSignup(sent, name.trim(), job === "Other" ? jobOther.trim() : job)} />
              <div className="actions"><button className="btn" type="button" onClick={() => setSent("")}>Use a different email</button></div>
            </motion.div>
          ) : (
            <motion.form key="form" className="panel corner" onSubmit={submit} noValidate {...card}>
              <div className="field"><label htmlFor="name">Your name</label><input type="text" id="name" autoComplete="name" maxLength={80} placeholder="First and last name" value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="field"><label htmlFor="email">Email</label><input type="email" id="email" autoComplete="email" maxLength={160} value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div className="field">
                <span className="label">I'm in the</span>
                <div className="seg big" role="radiogroup" aria-label="Cast or crew">
                  <label className="plain"><input type="radio" name="dept" checked={dept === "cast"} onChange={() => setDept("cast")} />Cast</label>
                  <label className="plain"><input type="radio" name="dept" checked={dept === "crew"} onChange={() => setDept("crew")} />Crew</label>
                </div>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {dept === "cast" ? (
                  <motion.div key="cast" className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                    <span className="label" id="chars-l">Who do you play?</span>
                    <div className="chips" role="group" aria-labelledby="chars-l">
                      {CAST.map(c => (
                        <label key={c} className="chip"><input type="checkbox" checked={chars.includes(c)} onChange={e => setChars(e.target.checked ? [...chars, c] : chars.filter(x => x !== c))} />{c}</label>
                      ))}
                    </div>
                    <span className="hint">Pick every part you play. Not sure yet? Pick the closest one and the producer can fix it.</span>
                  </motion.div>
                ) : (
                  <motion.div key="crew" className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                    <label htmlFor="job">Your job on set</label>
                    <Dropdown id="job" value={job} onChange={setJob} placeholder="Choose your job…" options={JOBS.map(j => ({ value: j, label: j }))} />
                    {job === "Other" && <input type="text" maxLength={80} placeholder="Type your job" autoFocus value={jobOther} onChange={e => setJobOther(e.target.value)} />}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Sign me up"}</button></div>
              <div className="err" role="alert">{err}</div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
