// Vault prices travel as integer cents (backend `price_cents`); 0 is free.
// Bounds mirror backend/src/vault/schemas.py.
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 1_000_000;

export function formatPrice(
  cents: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100,
  );
}

// Parses what a person types in the price field ("29,90", "29.90",
// "R$ 1.234,56", "1,234.56") into cents. The last `,` or `.` followed by
// one or two digits is the decimal separator; any other separator is
// grouping. Returns null for anything that is not a positive amount.
export function parsePriceInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const match = cleaned.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = (match ? match[1] : cleaned).replace(/[.,]/g, "");
  const fraction = match ? match[2].padEnd(2, "0") : "00";
  const cents = Number(whole || "0") * 100 + Number(fraction);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function isValidPaidPrice(cents: number | null): cents is number {
  return cents !== null && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS;
}
