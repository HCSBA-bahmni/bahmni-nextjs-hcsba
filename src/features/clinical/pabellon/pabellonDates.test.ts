import {describe,expect,it} from "vitest";
import {formatPabellonDate,formatPabellonDateTime,formatPabellonSourceDate,formatPabellonVisit} from "./pabellonDates";
describe("Pabellon Tempo dates",()=>{
  it.each(["2026-11-06 08:00:00","2026-11-06T08:00:00Z","2026-11-06T08:00:00.123456789Z","2026-11-06T08:00:00-03:00"])("preserves original clinical clock %s",raw=>expect(formatPabellonDateTime(raw)).toBe("06-11-2026 08:00"));
  it.each(["1997-01-21","1997-01-21T00:00:00Z","1997-01-21T00:00:00+03:00"])("never shifts calendar birthday %s",raw=>expect(formatPabellonDate(raw)).toBe("21/01/1997"));
  it("uses Santiago only for genuine OpenMRS instants",()=>{
    expect(formatPabellonVisit("2026-11-06T12:00:00Z")).toBe("06-11-2026 09:00");
    expect(formatPabellonVisit("2026-07-06T12:00:00Z")).toBe("06-07-2026 08:00");
    expect(formatPabellonVisit("2026-11-06 12:00:00")).toBe("06-11-2026 12:00");
  });
  it.each([null,undefined,"","0001-01-01T00:00:00Z"])("preserves missing values %s",raw=>{
    expect(formatPabellonDate(raw)).toBe("—");expect(formatPabellonDateTime(raw)).toBe("—");
  });
  it.each(["2026-02-30","2023-02-29","2026-13-01","2026-11-06T25:00:00Z","2026-11-06T08:61:00Z","not a date"])("rejects invalid dates without substituting today %s",raw=>expect(formatPabellonDateTime(raw)).toBe("Fecha no válida"));
  it("accepts leap day, date-only and source wrappers",()=>{
    expect(formatPabellonDate("2024-02-29")).toBe("29/02/2024");
    expect(formatPabellonDateTime("2026-11-06")).toBe("06-11-2026");
    expect(formatPabellonSourceDate({rawValue:"2026-11-06 15:01:35.422228"})).toBe("06-11-2026 15:01");
  });
});
