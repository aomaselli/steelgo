import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Company, Profile, UserRole } from "@/types/database";

// Modulo 3 (delegacao operacional, alternativa B): alem da empresa de que o
// usuario e proprietario, a sessao descobre as empresas em que ele e membro
// ATIVO (company_members: operator | viewer). O proprietario tem precedencia
// quando tambem for membro. Membros revogados/convidados nao recebem empresa.
export type CompanyRole = "owner" | "operator" | "viewer";
export type CompanyAccess = { company: Company; role: CompanyRole };
export type MembershipInfo = {
  company_id: string;
  member_role: string;
  status: "invited" | "active" | "revoked";
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** empresa selecionada (do proprietario ou de um vinculo ativo) */
  company: Company | null;
  /** papel do usuario NA empresa selecionada */
  companyRole: CompanyRole | null;
  /** todas as empresas acessiveis (proprietario + vinculos ativos) */
  companies: CompanyAccess[];
  /** vinculos brutos (inclui convites pendentes e revogados) */
  memberships: MembershipInfo[];
  selectCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    data: {
      full_name?: string;
      role?: UserRole;
      phone?: string;
      cpf?: string;
      pending_company?: Record<string, unknown> | null;
    },
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: Error | null }>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SELECTED_KEY = (uid: string) => `steelgo.company.${uid}`;

function readSelected(uid: string): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY(uid));
  } catch {
    return null;
  }
}
function writeSelected(uid: string, id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_KEY(uid), id);
    else localStorage.removeItem(SELECTED_KEY(uid));
  } catch {
    /* ignore */
  }
}

/** Descobre as empresas acessiveis: proprietario (precedencia) + vinculos ativos. */
async function discoverCompanies(
  uid: string,
): Promise<{ accesses: CompanyAccess[]; memberships: MembershipInfo[] }> {
  const [{ data: owned }, { data: memberRows }] = await Promise.all([
    supabase.from("companies").select("*").eq("owner_id", uid).order("created_at"),
    supabase
      .from("company_members")
      .select("company_id, member_role, status")
      .eq("user_id", uid)
      .order("accepted_at", { ascending: true, nullsFirst: false }),
  ]);
  const memberships = (memberRows ?? []) as MembershipInfo[];
  const accesses: CompanyAccess[] = (owned ?? []).map((c) => ({
    company: c as Company,
    role: "owner",
  }));
  const ownedIds = new Set(accesses.map((a) => a.company.id));
  const activeMembers = memberships.filter(
    (m) =>
      m.status === "active" &&
      (m.member_role === "operator" || m.member_role === "viewer") &&
      !ownedIds.has(m.company_id),
  );
  if (activeMembers.length) {
    // RLS: companies_select permite o membro ativo ler a empresa; revogado nao le.
    const { data: memberCompanies } = await supabase
      .from("companies")
      .select("*")
      .in(
        "id",
        activeMembers.map((m) => m.company_id),
      );
    for (const m of activeMembers) {
      const c = (memberCompanies ?? []).find((x) => x.id === m.company_id);
      if (c) accesses.push({ company: c as Company, role: m.member_role as CompanyRole });
    }
  }
  return { accesses, memberships };
}

function pickSelected(uid: string, accesses: CompanyAccess[]): CompanyAccess | null {
  if (!accesses.length) {
    writeSelected(uid, null);
    return null;
  }
  const stored = readSelected(uid);
  const found = stored ? accesses.find((a) => a.company.id === stored) : undefined;
  if (found) return found;
  // padrao: primeira empresa propria; senao o primeiro vinculo ativo
  const first = accesses.find((a) => a.role === "owner") ?? accesses[0];
  writeSelected(uid, first.company.id);
  return first;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [companyRole, setCompanyRole] = useState<CompanyRole | null>(null);
  const [companies, setCompanies] = useState<CompanyAccess[]>([]);
  const [memberships, setMemberships] = useState<MembershipInfo[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks the uid that state should currently reflect; lets in-flight
  // fetches from a stale/previous uid detect they're obsolete and no-op.
  const activeUidRef = useRef<string | null>(null);

  const clearCompanyState = () => {
    setCompany(null);
    setCompanyRole(null);
    setCompanies([]);
    setMemberships([]);
  };

  const applyCompanies = (uid: string, accesses: CompanyAccess[], members: MembershipInfo[]) => {
    setCompanies(accesses);
    setMemberships(members);
    const sel = pickSelected(uid, accesses);
    setCompany(sel?.company ?? null);
    setCompanyRole(sel?.role ?? null);
  };

  const loadUserData = async (uid: string) => {
    activeUidRef.current = uid;
    setIsLoading(true);
    try {
      const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);

      // uid changed while this request was in flight — discard stale result
      if (activeUidRef.current !== uid) return;

      const firstRole = (roleRows?.[0]?.role ?? null) as UserRole | null;
      setRole(firstRole);
      setProfile(profileRow ? ({ ...profileRow, role: firstRole } as Profile) : null);

      if (firstRole === "shipper" || firstRole === "carrier") {
        const { accesses, memberships: members } = await discoverCompanies(uid);
        if (activeUidRef.current !== uid) return;
        applyCompanies(uid, accesses, members);
      } else {
        clearCompanyState();
      }
    } catch (err) {
      console.error("[Auth] loadUserData failed", err);
      if (activeUidRef.current === uid) {
        setProfile(null);
        setRole(null);
        clearCompanyState();
      }
    } finally {
      if (activeUidRef.current === uid) setIsLoading(false);
    }
  };

  useEffect(() => {
    // Listener FIRST, then getSession (Supabase rec)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        const uid = newSession.user.id;
        // Mark loading synchronously (same tick as isAuthenticated flips true)
        // so ProtectedRoute never renders with a stale/absent profile.
        activeUidRef.current = uid;
        setIsLoading(true);
        // Defer fetch to avoid blocking the auth callback
        setTimeout(() => {
          void loadUserData(uid);
        }, 0);
      } else {
        activeUidRef.current = null;
        setProfile(null);
        clearCompanyState();
        setRole(null);
        setIsLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void loadUserData(data.session.user.id);
      } else {
        activeUidRef.current = null;
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
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirect,
        data: {
          full_name: data.full_name ?? "",
          role: data.role ?? "shipper",
          phone: data.phone ?? null,
          pending_company: data.pending_company ?? null,
        },
      },
    });
    return { error: error ?? null };
  };

  const signOut = async () => {
    // Clear explicitly/immediately instead of waiting on the async listener
    activeUidRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    clearCompanyState();
    setRole(null);
    setIsLoading(false);
    await supabase.auth.signOut();
  };

  const updateProfile: AuthContextValue["updateProfile"] = async (data) => {
    if (!user) return { error: new Error("Not authenticated") };
    // Strip client-only `role` field — roles live in user_roles table
    const { role: _role, ...patch } = data;
    void _role;
    const { error } = await supabase
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", user.id);
    if (!error) await loadUserData(user.id);
    return { error: (error as unknown as Error) ?? null };
  };

  const refresh = async () => {
    if (user) await loadUserData(user.id);
  };

  /** Recarrega SOMENTE as empresas/vinculos (apos aceitar convite, revogacao, troca de papel). */
  const refreshCompanies = async () => {
    if (!user) return;
    const uid = user.id;
    const { accesses, memberships: members } = await discoverCompanies(uid);
    if (activeUidRef.current !== uid) return;
    applyCompanies(uid, accesses, members);
  };

  // Revogacao/reconvite feitos por outra pessoa: a sessao reavalia os vinculos ao
  // voltar o foco e a cada 60 s (o servidor ja recusa na hora; aqui a UI acompanha).
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void discoverCompanies(uid).then(({ accesses, memberships: members }) => {
        if (activeUidRef.current !== uid) return;
        applyCompanies(uid, accesses, members);
      });
    };
    const t = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const selectCompany = (companyId: string) => {
    if (!user) return;
    const found = companies.find((a) => a.company.id === companyId);
    if (!found) return; // nunca seleciona empresa fora da lista acessivel
    writeSelected(user.id, companyId);
    setCompany(found.company);
    setCompanyRole(found.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        company,
        companyRole,
        companies,
        memberships,
        selectCompany,
        refreshCompanies,
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
