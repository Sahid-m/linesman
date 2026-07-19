import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getSourceMarketDetail } from "@/lib/sources/manager";
import { FOCUS_COOKIE_NAME, parseFocusFixture } from "@/lib/focus/fixture";
import { MarketDetailView } from "@/components/linesman/market-detail-view";

export default async function MarketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atMs?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const outcomeId = decodeURIComponent(id);

  const store = await cookies();
  const focus = parseFocusFixture(store.get(FOCUS_COOKIE_NAME)?.value);
  const atFromQuery = query.atMs != null ? Number(query.atMs) : undefined;
  const atMs =
    typeof atFromQuery === "number" && Number.isFinite(atFromQuery)
      ? atFromQuery
      : focus?.atMs;

  const detail = await getSourceMarketDetail(outcomeId, { atMs });
  if (!detail) notFound();

  return <MarketDetailView detail={detail} />;
}
