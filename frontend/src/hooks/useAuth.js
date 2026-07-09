import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function useAuth() {
  const [user, setUser] = useState(isSupabaseConfigured ? undefined : null);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser(data.user);
      })
      .catch(() => {
        setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    loading: user === undefined,
    isLoggedIn: Boolean(user),
  };
}
