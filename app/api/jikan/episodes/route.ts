import { getAnimeEpisodes, getFullDetail, type JikanEpisode } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const expectedTotal = Number(url.searchParams.get("total") || 0);
  const status = url.searchParams.get("status") || undefined;
  const forceRefresh = url.searchParams.get("forceRefresh") === "true";

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json(
      { episodes: [], pagination: { last_visible_page: 1, has_next_page: false } },
      { status: 400 }
    );
  }

  try {
    const result = await getAnimeEpisodes(id, page, { status, forceRefresh });

    // If Jikan returns empty episodes on page 1, check if detail has known episode count and synthesize
    if (result.episodes.length === 0 && page === 1) {
      let totalCount = expectedTotal;
      if (!totalCount || totalCount <= 0) {
        try {
          const detail = await getFullDetail("anime", id);
          if (detail.episodes && detail.episodes > 0) {
            totalCount = detail.episodes;
          }
        } catch {
          // ignore detail fetch error
        }
      }

      if (totalCount > 0) {
        const synthesized: JikanEpisode[] = Array.from({ length: Math.min(totalCount, 100) }, (_, i) => ({
          mal_id: i + 1,
          title: `Episode ${i + 1}`,
          title_japanese: null,
          title_romanji: null,
          aired: null,
          score: null,
          filler: false,
          recap: false,
          forum_url: null,
        }));
        return Response.json(
          {
            episodes: synthesized,
            pagination: {
              last_visible_page: Math.ceil(totalCount / 100),
              has_next_page: totalCount > 100,
            },
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          }
        );
      }
    }

    return Response.json(
      {
        episodes: result.episodes,
        pagination: result.pagination,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        episodes: [],
        pagination: { last_visible_page: 1, has_next_page: false },
        error: error instanceof Error ? error.message : "Failed to fetch episodes",
      },
      { status: 502 }
    );
  }
}
