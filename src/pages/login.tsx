import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { resolveLoginDestination } from "@/config-compat/legacyRoutes";
import { useAuth } from "@/features/auth/AuthContext";
import * as authApi from "@/services/bahmni/auth";
import { audit } from "@/services/bahmni/audit";
import { loadLocaleLanguages, loadLoginConfig, loadWhiteLabel } from "@/services/bahmni/config";
import { BahmniApiError } from "@/services/bahmni/http";

const schema = z.object({
  username: z.string().min(1, "Ingrese su usuario"),
  password: z.string().min(1, "Ingrese su contraseña"),
  otp: z.string().optional(),
});
type Values = z.infer<typeof schema>;

interface LocaleOption { code: string; nativeName: string }

function navigateRemembered(rememberedUrl: string): void {
  if (rememberedUrl.startsWith("/bahmni/")) window.location.replace(rememberedUrl);
  else window.location.replace(`/bahmni${rememberedUrl}`);
}

export default function LoginPage() {
  const { authenticate, session, location, loading, error: sessionError } = useAuth();
  const router = useRouter();
  const [needsOtp, setNeedsOtp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState(() => authApi.getPersistedLocale("es"));
  const [showPassword, setShowPassword] = useState(false);
  const whiteLabel = useQuery({ queryKey: ["white-label"], queryFn: loadWhiteLabel });
  const loginConfig = useQuery({ queryKey: ["login-config"], queryFn: loadLoginConfig });
  const localeConfig = useQuery({
    queryKey: ["locale-languages"],
    queryFn: async () => {
      const [languageConfig, allowed] = await Promise.all([loadLocaleLanguages(), authApi.getAllowedLocaleCodes()]);
      return { languageConfig, allowed };
    },
  });
  const serverTime = useQuery({
    queryKey: ["server-time"],
    queryFn: async () => {
      const response = await fetch("/cgi-bin/systemdate", { credentials: "include", cache: "no-store" });
      return response.ok ? await response.json() as { date?: string; offset?: string } : {};
    },
  });
  const { register, handleSubmit, getValues, reset, resetField, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  const loginPage = (whiteLabel.data?.loginPage ?? {}) as Record<string, unknown>;
  const logo = typeof loginPage.logo === "string" ? loginPage.logo : undefined;
  const locales = useMemo(() => {
    const configured = Array.isArray(localeConfig.data?.languageConfig.locales)
      ? localeConfig.data.languageConfig.locales as LocaleOption[]
      : [{ code: "es", nativeName: "Español" }];
    const allowed = localeConfig.data?.allowed ?? [];
    if (!allowed.length) return configured;
    return allowed.map((code) => configured.find((candidate) => candidate.code === code) ?? { code, nativeName: code });
  }, [localeConfig.data]);
  const timezoneMismatch = Boolean(serverTime.data?.offset && !new Date().toString().includes(serverTime.data.offset));
  const rawReturnUrl = router.query.returnUrl ?? router.query.from;
  const whiteListedDomains = useMemo(() => Array.isArray(loginConfig.data?.whiteListedDomains)
    ? loginConfig.data.whiteListedDomains.filter((value): value is string => typeof value === "string")
    : [], [loginConfig.data]);

  useEffect(() => {
    if (!router.isReady || loading || busy || loginConfig.isLoading || !session?.authenticated) return;
    const destination = resolveLoginDestination(rawReturnUrl, whiteListedDomains, window.location.origin);
    if (location && destination.external) window.location.replace(destination.href);
    else void router.replace(location ? destination.href : `/location?locale=${encodeURIComponent(locale)}&returnUrl=${encodeURIComponent(typeof rawReturnUrl === "string" ? rawReturnUrl : "/home")}`);
  }, [busy, loading, locale, location, loginConfig.isLoading, rawReturnUrl, router, session, whiteListedDomains]);

  const submit = async (values: Values, resend = false) => {
    setBusy(true);
    setError("");
    try {
      const result = await authenticate(values.username, values.password, locale, values.otp, resend);
      if (resend || !result) {
        setNeedsOtp(true);
        return;
      }
      void audit("USER_LOGIN_SUCCESS", "USER_LOGIN_SUCCESS");
      if (result.restoredLocation) void audit("USER_LOGIN_LOCATION_SUCCESS", "USER_LOGIN_LOCATION_SUCCESS");
      const destination = resolveLoginDestination(rawReturnUrl, whiteListedDomains, window.location.origin);
      if (result.session.sessionLocation) {
        if (destination.external) window.location.replace(destination.href);
        else if (!rawReturnUrl && result.rememberedUrl) navigateRemembered(result.rememberedUrl);
        else await router.replace(destination.href);
      } else {
        await router.replace(`/location?locale=${encodeURIComponent(locale)}&returnUrl=${encodeURIComponent(typeof rawReturnUrl === "string" ? rawReturnUrl : "/home")}`);
      }
    } catch (exception) {
      void audit("USER_LOGIN_FAILED", "USER_LOGIN_FAILED");
      if (exception instanceof authApi.MissingProviderError) {
        setNeedsOtp(false);
        setError(exception.message);
      } else if (exception instanceof BahmniApiError) {
        if (exception.status === 410 || exception.status === 429) {
          // Legacy returns to the first factor and clears credentials after an
          // expired code or too many OTP attempts.
          setNeedsOtp(false);
          reset({ username: "", password: "", otp: "" });
          setError(exception.status === 410
            ? "El código expiró. Ingrese nuevamente sus credenciales."
            : "Demasiados intentos. Espere antes de reintentar.");
        } else if (exception.status === 401 && needsOtp) {
          // A 401 identifies an invalid OTP only after OpenMRS previously
          // requested the second factor with a 204 response.
          setNeedsOtp(true);
          resetField("otp");
          setError("Código inválido.");
        } else {
          setNeedsOtp(false);
          resetField("otp");
          setError("Usuario o contraseña incorrectos.");
        }
      } else {
        setError("No fue posible completar el inicio de sesión.");
      }
    } finally {
      setBusy(false);
    }
  };

  return <main className="centered"><form className="auth-card" onSubmit={handleSubmit((values) => submit(values))}>
    {logo && <Image unoptimized src={logo} width={180} height={90} style={{ objectFit: "contain" }} alt="Logo HCSBA" />}
    <h1>Acceso HCSBA</h1>
    <p>Bahmni · Plataforma clínica</p>
    {(error || sessionError || router.query.sessionExpired) && <div role="alert" className="error-banner">{error || sessionError || "Tu sesión expiró. Inicia sesión nuevamente."}</div>}
    {timezoneMismatch && <div role="alert" className="warning-banner">La zona horaria del servidor ({serverTime.data?.offset}) difiere de la estación de trabajo.</div>}
    <div className="field"><label htmlFor="locale">Idioma</label><select id="locale" className="p-inputtext p-component" value={locale} onChange={(event) => setLocale(event.target.value)}>{locales.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}</select></div>
    <div className="field"><label htmlFor="username">Usuario</label><InputText id="username" autoComplete="username" {...register("username")} />{errors.username && <small className="field-error">{errors.username.message}</small>}</div>
    <div className="field"><label htmlFor="password">Contraseña</label><div className="p-inputgroup"><InputText id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" {...register("password")} /><Button type="button" outlined icon={showPassword ? "pi pi-eye-slash" : "pi pi-eye"} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShowPassword((visible) => !visible)} /></div>{errors.password && <small className="field-error">{errors.password.message}</small>}</div>
    {needsOtp && <div className="field"><label htmlFor="otp">Código de verificación</label><InputText id="otp" type="password" inputMode="numeric" autoComplete="one-time-code" {...register("otp")} /><Button type="button" text label="Reenviar código" onClick={() => void submit(getValues(), true)} /></div>}
    <Button type="submit" label="Ingresar" icon="pi pi-sign-in" loading={busy} disabled={loading} className="w-full" />
  </form></main>;
}
