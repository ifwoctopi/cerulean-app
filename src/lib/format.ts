export function fmtBytes(b: number | null | undefined) {
  if (!b) return "0 KB";
  const u = ["B", "KB", "MB", "GB"]; let i = 0;
  while (b >= 1024 && i < 3) { b /= 1024; i++; }
  return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + " " + u[i];
}
export function fmtDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "";
  const x = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  return x.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: "numeric" });
}
// Local yyyy-mm-dd without time-zone drift.
export function iso(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function addDays(s: string, n: number) {
  const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d);
}
export const fmtClock = (t: string) => { const [h, m] = t.split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + " " + (h < 12 ? "AM" : "PM"); };
export const windowText = (e: { start_time?: string | null; end_time?: string | null }) => (e.start_time && e.end_time ? fmtClock(e.start_time) + " – " + fmtClock(e.end_time) : "");
// "10:00 AM" / "6pm" / "TBD" -> minutes after midnight, or null when it isn't a clock time.
export function parseClock(t: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?\s*$/i.exec(t || "");
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] || 0);
  if (h < 1 || h > 12 || min > 59) return null;
  return (h % 12) * 60 + min + (m[3].toLowerCase() === "p" ? 720 : 0);
}
// "HH:MM" (24 hour, from a time input) -> "10:00 AM"
export const clockText = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM"); };
// "10:00 AM" -> "10:00" for a time input, or "" if it isn't a clock time.
export const clockInput = (t: string) => { const v = parseClock(t); return v === null ? "" : String(Math.floor(v / 60)).padStart(2, "0") + ":" + String(v % 60).padStart(2, "0"); };
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
