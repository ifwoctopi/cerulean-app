import type { ShootDay } from "./types";

/** Extras are stored with this single character, so an event is on their call sheet when "Extras" is ticked on it. */
export const EXTRAS = "Extras";

export type Dept = "cast" | "crew" | "extra";
export const DEPTS: Dept[] = ["cast", "crew", "extra"];
export const deptName = (d: string) => (d === "crew" ? "Crew" : d === "extra" ? "Extra" : "Cast");

type P = { department: string; characters: string[]; job: string };
/** What to show next to a person's name: who they play, their job, or "Extra". */
export const personLabel = (p: P) => (p.department === "cast" ? (p.characters || []).join(", ") : p.department === "extra" ? "Extra" : p.job);
/** Crew are on every call sheet. Cast and extras are on the ones that list their character (or "Extras"). */
export const isOnCall = (p: Pick<P, "department" | "characters">, day: ShootDay) => p.department === "crew" || (p.characters || []).some(c => day.characters.includes(c));
