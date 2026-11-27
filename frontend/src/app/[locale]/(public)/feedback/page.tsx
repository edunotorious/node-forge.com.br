import { setRequestLocale } from "next-intl/server";

import { FeedbackWall } from "@/components/feedback/feedback-wall";
import { FEEDBACK_PAGE_SIZE, safeFromPath } from "@/lib/feedback";
import { getCurrentUser, listFeedback } from "@/lib/server-api";

// Public community feedback wall. Anyone can read; posting needs an account.
export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { from } = await searchParams;
  const [user, initial] = await Promise.all([
    getCurrentUser(),
    listFeedback({ limit: FEEDBACK_PAGE_SIZE }),
  ]);
  return <FeedbackWall initial={initial} signedIn={!!user} from={safeFromPath(from)} />;
}
