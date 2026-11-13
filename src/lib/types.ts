export type Role = "admin" | "member";
export interface Profile {
  id: string; email: string; full_name: string; role: Role; approved: boolean; member: boolean;
}
export interface ShootDay {
  id: string; shoot_date: string; day_label: string; title: string; location: string; address: string;
  scenes: string; crew_call: string; cast_call: string; wrap: string; characters: string[]; confirmed: boolean; sort_order: number;
}
export interface Person {
  id: string; user_id: string | null; name: string; department: "cast" | "crew"; characters: string[]; job: string; notes: string;
}
export interface Answer { s: "yes" | "maybe" | "no"; r: string }
export interface CalEntry {
  id: string; person_id: string; entry_date: string; status: "available" | "tentative" | "unavailable"; reason: string; time_note: string; start_time?: string | null; end_time?: string | null;
}
export interface CastCard { id: string; character: string; actor_name: string; blurb: string; photo_path: string | null; sort_order: number }
export interface DocRow {
  id: string; title: string; category: string; meeting_date: string | null; description: string; file_path: string;
  file_name: string; mime_type: string; size_bytes: number; uploaded_by: string | null; created_at: string;
}
export interface Photo { id: string; file_path: string; caption: string; taken_on: string | null; shoot_day: string | null; created_at: string }
export interface Announcement {
  id: string; title: string; body: string; pinned: boolean; meeting_at: string | null; meeting_link: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
