// Supabase Edge Function: emails admins when someone new needs approval, and emails the person once approved.
// Called by two Database Webhooks on public.profiles (INSERT and UPDATE). See supabase/NOTIFICATIONS.md.
import { createClient } from "npm:@supabase/supabase-js@2";

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const SITE = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
const FROM = Deno.env.get("FROM_EMAIL") || "Cerulean <onboarding@resend.dev>";

async function send(to: string[], subject: string, heading: string, body: string, cta: { label: string; href: string }) {
  if (!to.length) return;
  const html = `<!doctype html><html><body style="margin:0;background:#000;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;border:1px solid #232326;background:#0b0b0c;padding:32px;font-family:'Courier New',Courier,monospace;color:#f4f4f5;">
    <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#3ea6f2;">Cerulean</div>
    <h1 style="margin:14px 0 12px;font-size:26px;line-height:1.2;letter-spacing:1px;">${esc(heading)}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#c9c9ce;">${body}</p>
    <a href="${esc(cta.href)}" style="display:inline-block;background:#3ea6f2;color:#000;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">${esc(cta.label)}</a>
  </div></body></html>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + Deno.env.get("RESEND_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) console.error("Resend failed", r.status, await r.text());
}

Deno.serve(async req => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) return new Response("forbidden", { status: 403 });
  const { type, table, record, old_record } = await req.json();
  if (table !== "profiles" || !record) return new Response("ignored");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const emailOf = async (id: string) => (await db.auth.admin.getUserById(id)).data.user?.email || "";
  const name = esc(record.full_name || "Someone new");

  // New person waiting for approval -> every admin
  if (type === "INSERT" && record.approved === false && record.role !== "admin") {
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
    const to = (await Promise.all((admins || []).map(a => emailOf(a.id)))).filter(Boolean);
    const who = record.full_name || (await emailOf(record.id)) || "A new person";
    await send(to, `New sign-up to approve: ${who}`, "Someone needs approval",
      `<b>${esc(who)}</b> just signed up and is waiting for you to approve them. They can't see the site until you do.`,
      { label: "Review in Manage", href: SITE + "/admin" });
  }

  // Approved just now -> the person
  if (type === "UPDATE" && old_record?.approved === false && record.approved === true && record.role !== "admin") {
    const to = await emailOf(record.id);
    await send(to ? [to] : [], "You're approved for Cerulean", "You're in",
      `${name}, you've been approved. You can now see the schedule, mark your availability and check your call dates.`,
      { label: "Open Cerulean", href: SITE + "/login" });
  }
  return new Response("ok");
});
