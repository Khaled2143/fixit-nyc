"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

interface ProfileState {
  username: string | null;
  bannedAt: string | null;
}

export function useProfile(user: User | null): {
  profile: ProfileState | null;
  loading: boolean;
  refresh: () => void;
} {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/profile");
        const data = res.ok ? await res.json() : null;
        if (!ignore) {
          setProfile(data);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      ignore = true;
    };
  }, [user, refreshKey]);

  return { profile, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
