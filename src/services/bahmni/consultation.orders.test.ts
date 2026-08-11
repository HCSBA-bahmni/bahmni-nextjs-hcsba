import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllOrderables } from "./consultation";

describe("All Orderables wire contract", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the exact configured concept hierarchy used by the legacy orders tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ uuid: "all-orderables", setMembers: [] }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAllOrderables()).resolves.toMatchObject({ uuid: "all-orderables" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/concept");
    expect(url.searchParams.get("s")).toBe("byFullySpecifiedName");
    expect(url.searchParams.get("name")).toBe("All Orderables");
    expect(url.searchParams.get("v")).toContain("conceptClass:(uuid,name,description)");
    expect(url.searchParams.get("v")).toContain("setMembers");
  });
});
