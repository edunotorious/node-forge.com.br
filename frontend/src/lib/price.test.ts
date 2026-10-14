import { describe, expect, it } from "vitest";

import { formatPrice, isValidPaidPrice, parsePriceInput } from "./price";

describe("parsePriceInput", () => {
  it.each([
    ["29,90", 2990],
    ["29.90", 2990],
    ["29", 2900],
    ["29,9", 2990],
    ["R$ 1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.000", 100000],
    [" 5 ", 500],
  ])("%s → %i cents", (raw, cents) => {
    expect(parsePriceInput(raw)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", ","])("rejects %j", (raw) => {
    expect(parsePriceInput(raw)).toBeNull();
  });
});

describe("isValidPaidPrice", () => {
  it("enforces the backend bounds", () => {
    expect(isValidPaidPrice(99)).toBe(false);
    expect(isValidPaidPrice(100)).toBe(true);
    expect(isValidPaidPrice(1_000_000)).toBe(true);
    expect(isValidPaidPrice(1_000_001)).toBe(false);
    expect(isValidPaidPrice(null)).toBe(false);
  });
});

describe("formatPrice", () => {
  it("formats BRL per locale", () => {
    expect(formatPrice(2990, "BRL", "pt-BR").replace(/\s/g, " ")).toBe("R$ 29,90");
    expect(formatPrice(2990, "BRL", "en")).toBe("R$29.90");
  });
});
