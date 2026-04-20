import { describe, it, expect } from "vitest";
import { mergeStructuredData } from "./merge.js";

describe("mergeStructuredData", () => {
  it("should accept non-conflicting changes", () => {
    const base = { name: "Alice", role: "dev", team: "backend" };
    const theirs = { name: "Alice", role: "dev", team: "backend" };
    const ours = { name: "Alice", role: "lead", team: "backend" };

    const { merged, conflicts } = mergeStructuredData(base, theirs, ours);

    expect(conflicts).toEqual([]);
    expect(merged.role).toBe("lead");
    expect(merged.name).toBe("Alice");
  });

  it("should keep server changes when we didn't modify", () => {
    const base = { name: "Alice", role: "dev" };
    const theirs = { name: "Alice", role: "lead" };
    const ours = { name: "Alice", role: "dev" };

    const { merged, conflicts } = mergeStructuredData(base, theirs, ours);

    expect(conflicts).toEqual([]);
    expect(merged.role).toBe("lead");
  });

  it("should report conflict when both sides changed the same field", () => {
    const base = { name: "Alice", role: "dev" };
    const theirs = { name: "Alice", role: "lead" };
    const ours = { name: "Alice", role: "senior" };

    const { merged, conflicts } = mergeStructuredData(base, theirs, ours);

    expect(conflicts).toEqual(["role"]);
    expect(merged.role).toBe("lead"); // server wins
  });

  it("should merge independent field changes", () => {
    const base = { name: "Alice", role: "dev", team: "backend" };
    const theirs = { name: "Alice", role: "lead", team: "backend" };
    const ours = { name: "Alice", role: "dev", team: "platform" };

    const { merged, conflicts } = mergeStructuredData(base, theirs, ours);

    expect(conflicts).toEqual([]);
    expect(merged.role).toBe("lead");
    expect(merged.team).toBe("platform");
  });

  it("should handle new fields from our side", () => {
    const base = { name: "Alice" };
    const theirs = { name: "Alice" };
    const ours = { name: "Alice", status: "active" };

    const { merged, conflicts } = mergeStructuredData(base, theirs, ours);

    expect(conflicts).toEqual([]);
    expect(merged.status).toBe("active");
  });

  it("should handle identical changes without conflict", () => {
    const base = { name: "Alice", role: "dev" };
    const theirs = { name: "Alice", role: "lead" };
    const ours = { name: "Alice", role: "lead" };

    const { merged, conflicts } = mergeStructuredData(base, theirs, ours);

    expect(conflicts).toEqual([]);
    expect(merged.role).toBe("lead");
  });
});
