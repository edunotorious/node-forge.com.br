// Vault filter vocabulary shared by the server page and the client
// island (server-api.ts is server-only, so the runtime values live here).
export const VAULT_PAGE_SIZE = 24;

export type VaultSort =
  | "recent"
  | "popular"
  | "liked"
  | "price_asc"
  | "price_desc";
export type VaultPriceFilter = "all" | "free" | "paid";

export const VAULT_SORTS: readonly VaultSort[] = [
  "recent",
  "popular",
  "liked",
  "price_asc",
  "price_desc",
];
export const VAULT_PRICE_FILTERS: readonly VaultPriceFilter[] = [
  "all",
  "free",
  "paid",
];

export function parseVaultSort(raw: string | undefined): VaultSort {
  return VAULT_SORTS.find((s) => s === raw) ?? "recent";
}

export function parseVaultPrice(raw: string | undefined): VaultPriceFilter {
  return VAULT_PRICE_FILTERS.find((p) => p === raw) ?? "all";
}
