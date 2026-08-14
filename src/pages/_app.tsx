import type { AppProps } from "next/app";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrimeReactProvider } from "primereact/api";
import { I18nextProvider } from "react-i18next";
import { AuthProvider } from "@/features/auth/AuthContext";
import i18n from "@/i18n";
import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import "@/styles/globals.css";
import "@/styles/consultation-documents.css";
import "@/styles/consultation-diagnosis.css";
import "@/styles/consultation-orders.css";
import "@/styles/allergies.css";
import "@/styles/medication.css";
import "@/styles/ipd.css";
import "@/styles/document-upload.css";

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  return <PrimeReactProvider value={{ ripple: true }}>
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}><AuthProvider><Component {...pageProps} /></AuthProvider></I18nextProvider>
    </QueryClientProvider>
  </PrimeReactProvider>;
}
