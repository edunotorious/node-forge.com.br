import { notFound } from "next/navigation";

import { VaultDetail } from "@/components/vault/vault-detail";
import { getCurrentUser, getServerVaultListing } from "@/lib/server-api";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function VaultDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [listing, user] = await Promise.all([
    getServerVaultListing(slug),
    getCurrentUser(),
  ]);
  if (!listing) notFound();

  return (
    <VaultDetail
      listing={listing}
      // Just the bits the client actions care about — auth gating + the
      // "edit/republish/delete" affordances for the author.
      viewer={
        user
          ? {
              id: user.id,
              isAuthor: listing.author?.id === user.id,
            }
          : null
      }
    />
  );
}
