import { Suspense } from "react";

import { VaultIndex } from "@/components/vault/vault-index";
import { listVaultListings } from "@/lib/server-api";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    sort?: string;
  }>;
}

// Public marketplace landing. Server-rendered so the initial scroll
// works without JS, but the search + filters live in a client island
// that fires a fresh fetch on every keystroke (debounced).
export default async function VaultPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initial = await listVaultListings({
    q: params.q,
    tag: params.tag,
    sort:
      params.sort === "popular" || params.sort === "liked"
        ? params.sort
        : "recent",
    limit: 24,
  });

  return (
    <Suspense>
      <VaultIndex
        initialListings={initial}
        initialQuery={params.q ?? ""}
        initialTag={params.tag ?? ""}
        initialSort={
          params.sort === "popular" || params.sort === "liked"
            ? params.sort
            : "recent"
        }
      />
    </Suspense>
  );
}
