import { beforeEach, describe, expect, it, vi } from "vitest";
import { escapeLikePattern, setUsername } from "./profiles";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("./supabase/admin", () => ({ supabaseAdmin: { from } }));

function mockProfilesTable(options: {
  existing?: { id: string } | null;
  updateError?: { code?: string; message?: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: options.existing ?? null });
  const ilike = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ ilike }));
  const eq = vi.fn().mockResolvedValue({ error: options.updateError ?? null });
  const update = vi.fn(() => ({ eq }));

  from.mockReturnValue({ select, update });

  return { select, ilike, maybeSingle, update, eq };
}

beforeEach(() => {
  from.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("escapeLikePattern", () => {
  it("escapes both LIKE wildcards", () => {
    expect(escapeLikePattern("a_b%c")).toBe("a\\_b\\%c");
  });

  it("leaves a plain username untouched", () => {
    expect(escapeLikePattern("khaled_99")).toBe("khaled\\_99");
    expect(escapeLikePattern("khaled99")).toBe("khaled99");
  });
});

describe("setUsername", () => {
  it("rejects when the pre-check finds the username on another account", async () => {
    const chain = mockProfilesTable({ existing: { id: "other-user" } });

    const result = await setUsername("me", "taken");

    expect(result).toEqual({ ok: false, error: "That username is already taken." });
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("looks the username up with LIKE wildcards escaped", async () => {
    const chain = mockProfilesTable({ existing: null });

    await setUsername("me", "a_b%c");

    expect(chain.ilike).toHaveBeenCalledWith("username", "a\\_b\\%c");
  });

  it("allows a user to re-set their own username", async () => {
    mockProfilesTable({ existing: { id: "me" } });

    expect(await setUsername("me", "mine")).toEqual({ ok: true });
  });

  it("rejects when the update hits a 23505 unique violation", async () => {
    mockProfilesTable({ existing: null, updateError: { code: "23505" } });

    const result = await setUsername("me", "raced");

    expect(result).toEqual({ ok: false, error: "That username is already taken." });
  });

  it("returns the generic error for any other update failure", async () => {
    mockProfilesTable({ existing: null, updateError: { code: "42501", message: "denied" } });

    const result = await setUsername("me", "nope");

    expect(result).toEqual({ ok: false, error: "Failed to set username." });
  });

  it("succeeds when the username is free", async () => {
    const chain = mockProfilesTable({ existing: null });

    expect(await setUsername("me", "fresh")).toEqual({ ok: true });
    expect(chain.update).toHaveBeenCalledWith({ username: "fresh" });
    expect(chain.eq).toHaveBeenCalledWith("id", "me");
  });
});
