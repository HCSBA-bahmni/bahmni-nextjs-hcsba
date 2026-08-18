import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Password } from "primereact/password";
import { ProgressSpinner } from "primereact/progressspinner";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { isKeycloakAuth } from "@/features/auth/authMode";
import { parsePasswordPolicies, passwordPolicyMessages } from "@/features/auth/passwordPolicies";
import { changePassword, getPasswordPolicies } from "@/services/bahmni/auth";

const schema = z.object({
  oldPassword: z.string().min(1, "Ingrese su contraseña actual."),
  newPassword: z.string().min(1, "Ingrese una contraseña nueva."),
  confirm: z.string().min(1, "Confirme la contraseña nueva."),
}).refine((value) => value.newPassword === value.confirm, {
  path: ["confirm"],
  message: "Las contraseñas no coinciden.",
});

type Values = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user } = useAuth();
  const keycloakAuth = isKeycloakAuth();
  const policies = useQuery({
    queryKey: ["password-policies"],
    queryFn: getPasswordPolicies,
    enabled: !keycloakAuth,
  });
  const messages = useMemo(() => passwordPolicyMessages(parsePasswordPolicies(policies.data ?? {})), [policies.data]);
  const [success, setSuccess] = useState("");
  const [submitError, setSubmitError] = useState("");
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { oldPassword: "", newPassword: "", confirm: "" },
  });

  useEffect(() => {
    if (keycloakAuth && router.isReady) void router.replace("/home");
  }, [keycloakAuth, router]);

  if (keycloakAuth) {
    return <AuthGuard><main className="centered"><ProgressSpinner aria-label="Volviendo al inicio" /></main></AuthGuard>;
  }

  const submit = async (values: Values) => {
    setSuccess("");
    setSubmitError("");
    try {
      await changePassword(values.oldPassword, values.newPassword);
      reset();
      setSuccess("La contraseña se cambió correctamente.");
    } catch {
      setSubmitError("No fue posible cambiar la contraseña. Revise la contraseña actual y las políticas configuradas.");
    }
  };

  return <AuthGuard><AppShell title="Cambiar contraseña" mainClassName="password-change-page">
    <div className="password-change-layout">
      <form className="panel password-change-form" onSubmit={handleSubmit(submit)} noValidate>
        {success && <div role="status" className="success-banner">{success}</div>}
        {submitError && <div role="alert" className="error-banner">{submitError}</div>}
        <div className="field">
          <label htmlFor="password-username">Usuario</label>
          <input id="password-username" className="p-inputtext p-component" value={user?.username ?? user?.display ?? ""} disabled />
        </div>
        <PasswordField name="oldPassword" label="Contraseña actual" control={control} error={errors.oldPassword?.message} />
        <PasswordField name="newPassword" label="Nueva contraseña" control={control} error={errors.newPassword?.message} />
        <PasswordField name="confirm" label="Confirmar contraseña" control={control} error={errors.confirm?.message} />
        <div className="actions password-change-actions">
          <Button type="button" outlined severity="secondary" label="Cancelar" onClick={() => void router.push("/home")} />
          <Button type="submit" label="Guardar" icon="pi pi-check" loading={isSubmitting} />
        </div>
      </form>
      <aside className="panel password-policy-panel" aria-labelledby="password-policy-title">
        <h2 id="password-policy-title">Políticas de contraseña</h2>
        {policies.isLoading && <p role="status">Cargando políticas…</p>}
        {policies.isError && <div role="alert" className="warning-banner">No fue posible cargar las políticas. OpenMRS seguirá validando la contraseña al guardar.</div>}
        {!policies.isLoading && !policies.isError && (messages.length
          ? <ol>{messages.map((message) => <li key={message}>{message}</li>)}</ol>
          : <p className="muted-text">OpenMRS no publicó políticas adicionales.</p>)}
      </aside>
    </div>
  </AppShell></AuthGuard>;
}

function PasswordField({
  name,
  label,
  control,
  error,
}: {
  name: keyof Values;
  label: string;
  control: Control<Values>;
  error?: string;
}) {
  const inputId = `password-${name}`;
  return <div className="field">
    <label htmlFor={inputId}>{label} <span aria-hidden="true">*</span></label>
    <Controller
      name={name}
      control={control}
      render={({ field }) => <Password
        inputId={inputId}
        name={field.name}
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        inputRef={field.ref}
        feedback={false}
        toggleMask
        invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />}
    />
    {error && <small id={`${inputId}-error`} className="field-error">{error}</small>}
  </div>;
}
