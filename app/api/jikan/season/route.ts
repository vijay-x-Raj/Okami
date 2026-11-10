import { aniListSeason } from "@/app/lib/anilist";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || undefined;
  const season = url.searchParams.get("season")?.trim() || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = clamp(Number(url.searchParams.get("limit") ?? 15), 1, 50);

  try {
    const data = await aniListSeason(year, season, page, limit);

    return Response.json(
      {
        data,
        pagination: {
          last_visible_page: 5,
          has_next_page: data.length >= limit,
        },
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
        data: [],
        pagination: { last_visible_page: 1, has_next_page: false },
        error: error instanceof Error ? error.message : "Failed to load seasonal anime.",
      },
      { status: 500 }
    );
  }
}
