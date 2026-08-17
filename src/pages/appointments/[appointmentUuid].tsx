import { useRouter } from "next/router";
import { AppointmentForm } from "@/features/appointments/AppointmentForm";
export default function EditAppointmentPage() { const router = useRouter(); const uuid = Array.isArray(router.query.appointmentUuid) ? router.query.appointmentUuid[0] : router.query.appointmentUuid; return uuid ? <AppointmentForm appointmentUuid={uuid} /> : null; }
