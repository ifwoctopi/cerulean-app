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
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
