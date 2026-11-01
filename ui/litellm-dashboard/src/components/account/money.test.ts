import { describe, expect, it } from "vitest";
import { formatCredits } from "./money";

describe("formatCredits", () => {
  it("preserves amounts beyond JavaScript's integer precision", () => {
    expect(formatCredits("9223372036854775807")).toBe("$9223372036.854775807");
    expect(formatCredits("-5500000000")).toBe("-$5.50");
    expect(formatCredits("1")).toBe("$0.000000001");
    expect(formatCredits("0")).toBe("$0.00");
  });
});
