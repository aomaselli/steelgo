import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Company, Profile, UserRole } from "@/types/database";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    data: { full_name?: string; role?: UserRole; phone?: string; cpf?: string },
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: Error | null }>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUserData = async (uid: string) => {
    try {
      const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);

      const firstRole = (roleRows?.[0]?.role ?? null) as UserRole | null;
      setRole(firstRole);
      setProfile(profileRow ? ({ ...profileRow, role: firstRole } as Profile) : null);

      if (firstRole === "shipper" || firstRole === "carrier") {
        const { data: companyRows } = await supabase
          .from("companies")
          .select("*")
          .eq("owner_id", uid)
          .limit(1);
        setCompany((companyRows?.[0] as Company | undefined) ?? null);
      } else {
        setCompany(null);
      }
    } catch (err) {
      console.error("[Auth] loadUserData failed", err);
    }
  };

  useEffect(() => {
    // Listener FIRST, then getSession (Supabase rec)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer fetch to avoid blocking the auth callback
        setTimeout(() => {
          void loadUserData(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setCompany(null);
        setRole(null);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void loadUserData(data.session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async (email, password, data) => {
    const redirect =
      typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirect,
        data: {
          full_name: data.full_name ?? "",
          role: data.role ?? "shipper",
          phone: data.phone ?? null,
          cpf: data.cpf ?? null,
        },
      },
    });
    return { error: error ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const updateProfile: AuthContextValue["updateProfile"] = async (data) => {
    if (!user) return { error: new Error("Not authenticated") };
    // Strip client-only `role` field — roles live in user_roles table
    const { role: _role, ...patch } = data;
    void _role;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("profiles").update(patch as any).eq("id", user.id);
    if (!error) await loadUserData(user.id);
    return { error: (error as unknown as Error) ?? null };
  };


  const refresh = async () => {
    if (user) await loadUserData(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        company,
        role,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signOut,
        updateProfile,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
