import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { ApiError, useApi, type Role, type User } from "../lib/api";

type ProfileState = {
  /** Your row in the backend's users table (null until you pick a role). */
  profile: User | null;
  /** Your paired patient or caretaker, if any. */
  partner: User | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  register: (role: Role, phoneNumber?: string) => Promise<void>;
  linkPartner: (email: string) => Promise<void>;
  unlinkPartner: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const [profile, setProfile] = useState<User | null>(null);
  const [partner, setPartner] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPartner = useCallback(async () => {
    try {
      setPartner(await api<User>("GET", "/me/partner"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setPartner(null);
      else throw e;
    }
  }, [api]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await api<User>("GET", "/me");
      setProfile(me);
      await loadPartner();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setProfile(null); // signed in with Clerk but hasn't picked a role yet
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [api, loadPartner]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const register = useCallback(
    async (role: Role, phoneNumber?: string) => {
      const me = await api<User>("POST", "/me", { role, phone_number: phoneNumber || null });
      setProfile(me);
      setPartner(null);
    },
    [api],
  );

  const linkPartner = useCallback(
    async (email: string) => {
      await api("POST", "/me/link", { partner_email: email });
      await loadPartner();
    },
    [api, loadPartner],
  );

  const unlinkPartner = useCallback(async () => {
    await api("DELETE", "/me/link");
    setPartner(null);
  }, [api]);

  return (
    <ProfileContext.Provider
      value={{ profile, partner, loading, error, refresh, register, linkPartner, unlinkPartner }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
}
