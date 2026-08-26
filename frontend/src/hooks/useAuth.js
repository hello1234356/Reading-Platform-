import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function getConfirmedUser(user) {
  return user?.email_confirmed_at ? user : null;
}

export function useAuth() {
  const [user, setUser] = useState(isSupabaseConfigured ? undefined : null);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser(getConfirmedUser(data.user));
      })
      .catch(() => {
        setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(getConfirmedUser(session?.user));
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    loading: user === undefined,
    isLoggedIn: Boolean(user),
  };
}
