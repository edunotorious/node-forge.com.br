import { Suspense } from "react";

import { VaultIndex } from "@/components/vault/vault-index";
import { listVaultListings, listVaultTags } from "@/lib/server-api";
import { VAULT_PAGE_SIZE, parseVaultPrice, parseVaultSort } from "@/lib/vault";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    sort?: string;
    price?: string;
  }>;
}

// Below this many listings the featured row would just repeat the grid.
const FEATURED_MIN_LISTINGS = 6;

// Public marketplace landing. Server-rendered so the initial scroll
// works without JS, but the search + filters live in a client island
// that fires a fresh fetch on every keystroke (debounced).
export default async function VaultPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sort = parseVaultSort(params.sort);
  const price = parseVaultPrice(params.price);

  const [initial, popular, tags] = await Promise.all([
    listVaultListings({
      q: params.q,
      tag: params.tag,
      sort,
      price,
      limit: VAULT_PAGE_SIZE,
    }),
    listVaultListings({ sort: "popular", limit: 3 }),
    listVaultTags(12),
  ]);
  const unfiltered = !params.q && !params.tag && price === "all";
  const featured =
    unfiltered && initial.length >= FEATURED_MIN_LISTINGS ? popular : [];

  return (
    <Suspense>
      <VaultIndex
        initialListings={initial}
        featured={featured}
        popularTags={tags}
        initialQuery={params.q ?? ""}
        initialTag={params.tag ?? ""}
        initialSort={sort}
        initialPrice={price}
      />
    </Suspense>
  );
}
