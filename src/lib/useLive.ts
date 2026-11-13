import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

// Live updates from Supabase Realtime: calls onChange (debounced) whenever one of the tables changes.
export function useLive(tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(",");
  useEffect(() => {
    if (!supabase) return;
    let t: ReturnType<typeof setTimeout>;
    const ch = supabase.channel("live-" + key + "-" + Math.random().toString(36).slice(2, 7));
    key.split(",").forEach(table =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => { clearTimeout(t); t = setTimeout(() => cb.current(), 400); }));
    ch.subscribe();
    return () => { clearTimeout(t); supabase!.removeChannel(ch); };
  }, [key]);
}
