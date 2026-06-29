import { useEffect, useState } from "react";
import { requireSupabase } from "../lib/supabase";

export function useAuth() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const supabase = requireSupabase();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
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
