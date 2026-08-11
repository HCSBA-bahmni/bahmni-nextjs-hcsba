import { describe, expect, it } from "vitest";
import { appointmentMeetingUrl, normalizeAppointments } from "./appointments";

describe("legacy appointment dashboard mapping", () => {
  it("converts one-based date arrays and keeps a formatted slot", () => {
    const [appointment] = normalizeAppointments([{ uuid: "a", DASHBOARD_APPOINTMENTS_START_DATE_IN_UTC_KEY: [2026, 8, 3, 9, 30], DASHBOARD_APPOINTMENTS_END_DATE_IN_UTC_KEY: [2026, 8, 3, 10, 0], DASHBOARD_APPOINTMENTS_KIND: "Virtual", tele_health_video_link: "https://meet.example/room" }], "es-CL");
    expect(appointment?.date?.getMonth()).toBe(7);
    expect(appointment?.slot).toMatch(/9:30.*10:00/);
    expect(appointment?.details).not.toHaveProperty("tele_health_video_link");
  });

  it("prefers the stored telehealth link and otherwise uses the configured domain", () => {
    const [linked, generated] = normalizeAppointments([{ uuid: "a", tele_health_video_link: "https://video/room" }, { uuid: "b" }], "es-CL");
    expect(appointmentMeetingUrl(linked!, "meet.jit.si")).toBe("https://video/room");
    expect(appointmentMeetingUrl(generated!, "https://meet.jit.si/")).toBe("https://meet.jit.si/b");
  });
});
