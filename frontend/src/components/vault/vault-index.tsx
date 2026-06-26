"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { VaultListingSummary } from "@/lib/server-api";

type SortMode = "recent" | "popular" | "liked";

interface VaultIndexProps {
  initialListings: VaultListingSummary[];
  initialQuery: string;
  initialTag: string;
  initialSort: SortMode;
}

// Client-side list view with debounced search. The server pre-renders
// `initialListings` so first paint is instant; subsequent filter changes
// hit the API as the user types.
export function VaultIndex({
  initialListings,
  initialQuery,
  initialTag,
  initialSort,
}: VaultIndexProps) {
  const t = useTranslations("vault");
  const [query, setQuery] = useState(initialQuery);
  const [tag, setTag] = useState(initialTag);
  const [sort, setSort] = useState<SortMode>(initialSort);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Debounce the text input — 300ms is the sweet spot between snappy
  // and not hammering the backend on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const listings = useQuery({
    queryKey: ["vault", debouncedQuery, tag, sort],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (debouncedQuery) qs.set("q", debouncedQuery);
      if (tag) qs.set("tag", tag);
      qs.set("sort", sort);
      qs.set("limit", "24");
      const res = await fetch(`/api/vault?${qs.toString()}`);
      if (!res.ok) throw new Error("vault fetch failed");
      return (await res.json()) as VaultListingSummary[];
    },
    initialData:
      debouncedQuery === initialQuery && tag === initialTag && sort === initialSort
        ? initialListings
        : undefined,
  });

  const items = listings.data ?? [];

  return (
    <div className="px-8 py-10 sm:px-12">
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="font-heading text-4xl font-black sm:text-5xl">
          {t("title")}
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 rounded-full bg-input/60 pl-9"
          />
        </div>

        {tag ? (
          <button
            type="button"
            onClick={() => setTag("")}
            className="rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/25"
          >
            #{tag} ✕
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("sort.label")}:</span>
          {(["recent", "popular", "liked"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSort(mode)}
              className={
                "rounded-full px-3 py-1 font-medium transition-colors " +
                (sort === mode
                  ? "bg-foreground text-background"
                  : "hover:bg-foreground/10")
              }
            >
              {t(`sort.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {listings.isPending ? (
        <ListingsSkeleton />
      ) : items.length === 0 ? (
        <EmptyState query={debouncedQuery} tag={tag} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onTagClick={(t) => setTag(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  onTagClick,
}: {
  listing: VaultListingSummary;
  onTagClick: (tag: string) => void;
}) {
  const t = useTranslations("vault");
  const authorName =
    listing.author?.display_name ??
    listing.author?.username ??
    t("deletedAuthor");

  return (
    <article className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg">
      <Link
        href={`/vault/${listing.slug}`}
        className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h2 className="line-clamp-2 font-heading text-lg font-bold leading-tight group-hover:text-primary">
          {listing.title}
        </h2>
        {listing.description ? (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
            {listing.description}
          </p>
        ) : null}
      </Link>

      {listing.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {listing.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium hover:bg-foreground/10"
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}

      <footer className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate font-medium">{authorName}</span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            {listing.clone_count}
          </span>
          <span className="flex items-center gap-1">
            <Heart
              className={
                "h-3.5 w-3.5 " +
                (listing.liked_by_me ? "fill-primary text-primary" : "")
              }
            />
            {listing.like_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {listing.comment_count}
          </span>
        </div>
      </footer>
    </article>
  );
}

function ListingsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-2xl border border-border bg-card"
        />
      ))}
    </div>
  );
}

function EmptyState({ query, tag }: { query: string; tag: string }) {
  const t = useTranslations("vault");
  const isFiltered = query || tag;
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 py-16 text-center">
      <p className="font-heading text-xl">
        {isFiltered ? t("empty.filtered") : t("empty.brandNew")}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {isFiltered ? t("empty.tryDifferent") : t("empty.beFirst")}
      </p>
    </div>
  );
}
