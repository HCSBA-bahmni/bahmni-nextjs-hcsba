import { useRouter } from "next/router";
import { useEffect } from "react";
export default function AppointmentsIndex() { const router = useRouter(); useEffect(() => { void router.replace("/appointments/summary"); }, [router]); return null; }
