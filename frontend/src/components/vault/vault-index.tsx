"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Atom,
  Heart,
  Layers,
  MessageCircle,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AuthorAvatar,
  authorLabel,
  ListingCover,
  PriceBadge,
} from "@/components/vault/listing-visuals";
import { Link } from "@/i18n/navigation";
import type { VaultListingSummary, VaultTagCount } from "@/lib/server-api";
import { cn } from "@/lib/utils";
import {
  VAULT_PAGE_SIZE,
  VAULT_PRICE_FILTERS,
  VAULT_SORTS,
  type VaultPriceFilter,
  type VaultSort,
} from "@/lib/vault";

interface VaultIndexProps {
  initialListings: VaultListingSummary[];
  featured: VaultListingSummary[];
  popularTags: VaultTagCount[];
  initialQuery: string;
  initialTag: string;
  initialSort: VaultSort;
  initialPrice: VaultPriceFilter;
}

// Marketplace landing. The server pre-renders the first page (plus the
// featured row and the category strip) so first paint is instant; filter
// changes then hit the API as the user types, and "load more" pages
// through the rest. Filters are mirrored into the URL so a search can be
// shared or reloaded.
export function VaultIndex({
  initialListings,
  featured,
  popularTags,
  initialQuery,
  initialTag,
  initialSort,
  initialPrice,
}: VaultIndexProps) {
  const t = useTranslations("vault");
  const [query, setQuery] = useState(initialQuery);
  const [tag, setTag] = useState(initialTag);
  const [sort, setSort] = useState<VaultSort>(initialSort);
  const [price, setPrice] = useState<VaultPriceFilter>(initialPrice);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Debounce the text input — 300ms is the sweet spot between snappy
  // and not hammering the backend on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (debouncedQuery) qs.set("q", debouncedQuery);
    if (tag) qs.set("tag", tag);
    if (price !== "all") qs.set("price", price);
    if (sort !== "recent") qs.set("sort", sort);
    const search = qs.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }, [debouncedQuery, tag, price, sort]);

  const isInitial =
    debouncedQuery === initialQuery &&
    tag === initialTag &&
    sort === initialSort &&
    price === initialPrice;

  const listings = useInfiniteQuery({
    queryKey: ["vault", debouncedQuery, tag, sort, price],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (debouncedQuery) qs.set("q", debouncedQuery);
      if (tag) qs.set("tag", tag);
      if (price !== "all") qs.set("price", price);
      qs.set("sort", sort);
      qs.set("limit", String(VAULT_PAGE_SIZE));
      qs.set("offset", String(pageParam));
      const res = await fetch(`/api/vault?${qs.toString()}`);
      if (!res.ok) throw new Error("vault fetch failed");
      return (await res.json()) as VaultListingSummary[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < VAULT_PAGE_SIZE
        ? undefined
        : allPages.length * VAULT_PAGE_SIZE,
    initialData: isInitial
      ? { pages: [initialListings], pageParams: [0] }
      : undefined,
  });

  const items = listings.data?.pages.flat() ?? [];
  const isFiltered = Boolean(debouncedQuery || tag || price !== "all");
  const showFeatured = !isFiltered && sort === "recent" && featured.length > 0;

  return (
    <div className="pb-16">
      <section className="relative overflow-hidden bg-[#0C1532] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[#5b8def]/25 blur-3xl"
        />
        <div className="relative px-8 py-12 sm:px-12 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/80">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t("hero.badge")}
          </span>
          <h1 className="mt-4 font-heading text-4xl font-black sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/70">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="h-12 rounded-full border-0 bg-white pl-11 text-base text-[#0C1532] shadow-lg placeholder:text-muted-foreground"
              />
            </div>
            <Button
              asChild
              size="lg"
              className="h-12 gap-2 rounded-full px-6"
            >
              <Link href="/projects">
                <Upload className="h-4 w-4" />
                {t("hero.cta")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="px-8 sm:px-12">
        {popularTags.length > 0 ? (
          <nav
            aria-label={t("categories.title")}
            className="-mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            <CategoryChip active={!tag} onClick={() => setTag("")}>
              {t("categories.all")}
            </CategoryChip>
            {popularTags.map((item) => (
              <CategoryChip
                key={item.tag}
                active={tag === item.tag}
                onClick={() => setTag(tag === item.tag ? "" : item.tag)}
              >
                #{item.tag}
                <span className="ml-1.5 text-xs opacity-60">{item.count}</span>
              </CategoryChip>
            ))}
            {tag && !popularTags.some((item) => item.tag === tag) ? (
              <CategoryChip active onClick={() => setTag("")}>
                #{tag} ✕
              </CategoryChip>
            ) : null}
          </nav>
        ) : tag ? (
          <div className="mt-6">
            <CategoryChip active onClick={() => setTag("")}>
              #{tag} ✕
            </CategoryChip>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div
            role="radiogroup"
            aria-label={t("price.filterLabel")}
            className="flex rounded-full bg-card p-1 shadow-sm ring-1 ring-border"
          >
            {VAULT_PRICE_FILTERS.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={price === mode}
                onClick={() => setPrice(mode)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  price === mode
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`price.filter.${mode}`)}
              </button>
            ))}
          </div>

          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("sort.label")}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as VaultSort)}
              className="h-9 rounded-full border border-border bg-card px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {VAULT_SORTS.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`sort.${mode}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showFeatured ? (
          <section className="mt-8">
            <SectionTitle>{t("featured")}</SectionTitle>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {featured.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onTagClick={setTag}
                  large
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <SectionTitle>
            {isFiltered ? t("results") : t("allProjects")}
          </SectionTitle>
          {listings.isPending ? (
            <ListingsSkeleton />
          ) : items.length === 0 ? (
            <EmptyState filtered={isFiltered} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onTagClick={setTag}
                  />
                ))}
              </div>
              {listings.hasNextPage ? (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => listings.fetchNextPage()}
                    disabled={listings.isFetchingNextPage}
                    className="rounded-full px-6"
                  >
                    {listings.isFetchingNextPage
                      ? t("loadingMore")
                      : t("loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-heading text-xl font-bold">{children}</h2>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-foreground ring-1 ring-border hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function ListingCard({
  listing,
  onTagClick,
  large = false,
}: {
  listing: VaultListingSummary;
  onTagClick: (tag: string) => void;
  large?: boolean;
}) {
  const t = useTranslations("vault");
  const authorName =
    authorLabel(listing.author, t);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-xl">
      <Link
        href={`/vault/${listing.slug}`}
        className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ListingCover
          slug={listing.slug}
          numQubits={listing.num_qubits}
          nodeCount={listing.node_count}
          className={large ? "aspect-[16/8]" : "aspect-[16/9]"}
        >
          <PriceBadge
            priceCents={listing.price_cents}
            currency={listing.currency}
            className="absolute right-3 top-3"
          />
        </ListingCover>

        <div className="flex flex-1 flex-col p-4">
          <h3
            className={cn(
              "line-clamp-2 font-heading font-bold leading-tight group-hover:text-primary",
              large ? "text-xl" : "text-base",
            )}
          >
            {listing.title}
          </h3>
          {listing.description ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Atom className="h-3.5 w-3.5" />
              {t("card.qubits", { count: listing.num_qubits })}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {t("card.nodes", { count: listing.node_count })}
            </span>
          </div>
        </div>
      </Link>

      {listing.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
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

      <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <AuthorAvatar name={authorName} />
          <span className="truncate font-medium">{authorName}</span>
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1" title={t("card.clones")}>
            <Sparkles className="h-3.5 w-3.5" />
            {listing.clone_count}
          </span>
          <span className="flex items-center gap-1" title={t("card.likes")}>
            <Heart
              className={cn(
                "h-3.5 w-3.5",
                listing.liked_by_me && "fill-primary text-primary",
              )}
            />
            {listing.like_count}
          </span>
          <span className="flex items-center gap-1" title={t("card.comments")}>
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
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-72 animate-pulse rounded-2xl border border-border bg-card"
        />
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const t = useTranslations("vault");
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 py-16 text-center">
      <p className="font-heading text-xl">
        {filtered ? t("empty.filtered") : t("empty.brandNew")}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {filtered ? t("empty.tryDifferent") : t("empty.beFirst")}
      </p>
    </div>
  );
}
