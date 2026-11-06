import { ensureMediaType } from "@/app/lib/jikan";
import { aniListSearch, type AniListSearchParams } from "@/app/lib/anilist";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const query = url.searchParams.get("q")?.trim() ?? "";
  const rawGenres = url.searchParams.get("genres")?.trim() ?? "";
  const season = url.searchParams.get("season")?.trim() ?? "";
  const year = Number(url.searchParams.get("year")) || undefined;
  const studio = url.searchParams.get("studio")?.trim() ?? "";
  const format = url.searchParams.get("format")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const sort = (url.searchParams.get("sort")?.trim() ?? "") as AniListSearchParams["sort"];
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = clamp(Number(url.searchParams.get("limit") ?? 24), 1, 50);

  const genres = rawGenres
    ? rawGenres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  try {
    const result = await aniListSearch({
      type,
      query: query || undefined,
      genres: genres.length > 0 ? genres : undefined,
      season: season || undefined,
      seasonYear: year,
      studio: studio || undefined,
      format: format || undefined,
      status: status || undefined,
      sort: sort || undefined,
      page,
      limit,
    });

    let filteredData = result.data;
    if (studio) {
      const studioLower = studio.toLowerCase();
      filteredData = filteredData.filter((item) => {
        const studios = item.studios?.map((s) => s.toLowerCase()) ?? [];
        const authors = item.authors?.map((a) => a.toLowerCase()) ?? [];
        return studios.some((s) => s.includes(studioLower)) || authors.some((a) => a.includes(studioLower));
      });
    }

    return Response.json(
      {
        data: filteredData,
        pagination: result.pagination,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        data: [],
        pagination: { last_visible_page: 1, has_next_page: false, total: 0 },
        error: error instanceof Error ? error.message : "Search failed.",
      },
      { status: 500 }
    );
  }
}
