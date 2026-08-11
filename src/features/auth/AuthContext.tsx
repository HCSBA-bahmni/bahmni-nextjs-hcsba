import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import type { BahmniLocation, BahmniProvider, BahmniSession, BahmniUser } from "@/types/bahmni";
import { audit } from "@/services/bahmni/audit";
import * as authApi from "@/services/bahmni/auth";

export interface AuthenticationResult {
  session: BahmniSession;
  restoredLocation: boolean;
  rememberedUrl: string | null;
}

interface AuthState {
  session: BahmniSession | null;
  user: BahmniUser | null;
  provider: BahmniProvider | null;
  location: BahmniLocation | null;
  loginLocations: BahmniLocation[];
  quickLogoutComboKey: string;
  loading: boolean;
  error: string | null;
  authenticate(username: string, password: string, locale: string, otp?: string, resendOTP?: boolean): Promise<AuthenticationResult | undefined>;
  selectLocation(location: BahmniLocation, locale?: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<BahmniSession | null>(null);
  const [user, setUser] = useState<BahmniUser | null>(null);
  const [provider, setProvider] = useState<BahmniProvider | null>(null);
  const [location, setLocation] = useState<BahmniLocation | null>(null);
  const [loginLocations, setLoginLocations] = useState<BahmniLocation[]>([]);
  const [quickLogoutComboKey, setQuickLogoutComboKey] = useState("Escape");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const handlingUnauthorized = useRef(false);

  const clearState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProvider(null);
    setLocation(null);
    setLoginLocations([]);
  }, []);

  const applyContext = useCallback((context: authApi.AuthenticatedContext) => {
    setSession(context.session);
    setUser(context.user);
    setProvider(context.provider);
    setLocation(context.location);
    setLoginLocations(context.loginLocations);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await authApi.getSession();
      if (!current.authenticated) {
        authApi.clearAuthenticationCookies();
        clearState();
        return;
      }
      const context = await authApi.loadAuthenticatedContext(current, { restoreLocation: true });
      applyContext(context);
      setQuickLogoutComboKey(await authApi.getQuickLogoutComboKey());
    } catch (exception) {
      clearState();
      if (exception instanceof authApi.MissingProviderError) {
        await authApi.logout().catch(() => undefined);
        setError(exception.message);
      } else {
        setError("No fue posible validar la sesión con OpenMRS.");
      }
    } finally {
      setLoading(false);
    }
  }, [applyContext, clearState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const unauthorized = () => {
      if (handlingUnauthorized.current) return;
      handlingUnauthorized.current = true;
      authApi.clearAuthenticationCookies();
      clearState();
      setError("Tu sesión expiró. Inicia sesión nuevamente.");
      const returnUrl = router.asPath.startsWith("/login") ? "/home" : router.asPath;
      void router.replace(`/login?sessionExpired=1&returnUrl=${encodeURIComponent(returnUrl)}`).finally(() => {
        handlingUnauthorized.current = false;
      });
    };
    window.addEventListener("bahmni:unauthorized", unauthorized);
    return () => window.removeEventListener("bahmni:unauthorized", unauthorized);
  }, [clearState, router]);

  const authenticate = useCallback(async (username: string, password: string, locale: string, otp?: string, resendOTP = false) => {
    const current = await authApi.login(username, password, otp, resendOTP);
    if (!current?.authenticated) return undefined;
    authApi.clearRootSessionCookie();
    try {
      const context = await authApi.loadAuthenticatedContext(current, { username, locale, restoreLocation: true });
      applyContext(context);
      setError(null);
      setQuickLogoutComboKey(await authApi.getQuickLogoutComboKey());
      return {
        session: context.session,
        restoredLocation: context.restoredLocation,
        rememberedUrl: authApi.getRememberedProviderContext(context.provider.uuid),
      };
    } catch (exception) {
      if (exception instanceof authApi.MissingProviderError) {
        await authApi.logout().catch(() => undefined);
        clearState();
      }
      throw exception;
    }
  }, [applyContext, clearState]);

  const selectLocation = useCallback(async (selected: BahmniLocation, locale = authApi.getPersistedLocale()) => {
    if (!user) throw new Error("No hay un usuario autenticado.");
    if (!loginLocations.some((candidate) => candidate.uuid === selected.uuid)) throw new Error("La ubicación no está habilitada para este proveedor.");
    const [current, savedUser] = await Promise.all([
      authApi.updateSessionLocation(selected, locale),
      authApi.saveDefaultLocale(user, locale),
    ]);
    setSession(current);
    setUser(savedUser);
    setLocation(current.sessionLocation ? { ...selected, ...current.sessionLocation } : selected);
  }, [loginLocations, user]);

  const signOut = useCallback(async () => {
    await audit("USER_LOGOUT_SUCCESS", "USER_LOGOUT_SUCCESS", undefined, "MODULE_LABEL_LOGOUT_KEY");
    if (provider && typeof window !== "undefined") {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      await authApi.rememberProviderContext(provider.uuid, currentPath);
    }
    await authApi.logout();
    clearState();
    await router.replace("/login");
  }, [clearState, provider, router]);

  const value = useMemo<AuthState>(() => ({
    session,
    user,
    provider,
    location,
    loginLocations,
    quickLogoutComboKey,
    loading,
    error,
    authenticate,
    selectLocation,
    signOut,
    refresh,
  }), [session, user, provider, location, loginLocations, quickLogoutComboKey, loading, error, authenticate, selectLocation, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
