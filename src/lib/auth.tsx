import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./types";

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setName: (name: string) => Promise<boolean>;
}
const Ctx = createContext<AuthCtx>({
  session: null, profile: null, loading: true, refresh: async () => {}, signOut: async () => {}, setName: async () => false,
});
export const useAuth = () => useContext(Ctx);

async function loadProfile(session: Session): Promise<Profile> {
  const sb = supabase!;
  let { data, error }: { data: any; error: any } = await sb.from("profiles").select("id, full_name, role, approved").eq("id", session.user.id).maybeSingle();
  if (error) { // database set up with an older schema.sql (no "approved" column yet)
    const r: { data: any } = await sb.from("profiles").select("id, full_name, role").eq("id", session.user.id).maybeSingle();
    data = r.data; if (data) data.approved = true;
  }
  const p = data
    ? { email: session.user.email || "", ...data }
    : { id: session.user.id, email: session.user.email || "", full_name: "", role: "member", approved: false };
  p.member = p.role === "admin" || p.approved !== false;
  return p as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!supabase);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    setProfile(s ? await loadProfile(s) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      // defer: calling supabase inside this callback can deadlock
      setTimeout(() => apply(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [apply]);

  const value = useMemo<AuthCtx>(() => ({
    session, profile, loading,
    refresh: async () => { if (supabase) { const { data } = await supabase.auth.getSession(); await apply(data.session); } },
    signOut: async () => { await supabase?.auth.signOut(); setProfile(null); setSession(null); },
    setName: async (name: string) => {
      if (!supabase || !profile) return false;
      const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", profile.id);
      if (error) return false;
      setProfile({ ...profile, full_name: name });
      return true;
    },
  }), [session, profile, loading, apply]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
