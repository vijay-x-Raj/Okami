import { ensureMediaType, getRelated } from "@/app/lib/jikan";
import { aniListFranchise } from "@/app/lib/anilist";
import {
  getServerCache,
  setServerCache,
  isJikanAvailable,
  reportJikanSuccess,
  reportJikanFailure,
} from "@/app/lib/server-cache";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ related: [] }, { status: 400 });
  }

  const cacheKey = `related:${type}:${id}`;
  const cached = getServerCache<{ related: unknown[] }>(cacheKey);
  if (cached) {
    return Response.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Cache": "HIT",
      },
    });
  }

  // 1. Try Jikan if healthy with an 800ms budget
  if (isJikanAvailable()) {
    try {
      const related = await Promise.race([
        getRelated(type, id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Jikan related timeout")), 800)
        ),
      ]);
      if (Array.isArray(related) && related.length > 0) {
        reportJikanSuccess();
        const payload = { related };
        setServerCache(cacheKey, payload);
        return Response.json(payload, {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            "X-Okami-Provider": "Jikan",
          },
        });
      }
    } catch {
      reportJikanFailure();
    }
  }

  // 2. Fast AniList relations fallback (~200ms)
  try {
    const graph = await aniListFranchise(type, id);
    const relatedGroups: Array<{
      relation: string;
      entry: Array<{ mal_id: number; type: string; name: string; url: string }>;
    }> = [];

    if (graph.seasons.length > 0) {
      relatedGroups.push({
        relation: "Sequel / Prequel",
        entry: graph.seasons
          .filter((s) => s.malId !== id)
          .map((s) => ({
            mal_id: s.malId,
            type: "anime",
            name: s.title,
            url: `https://myanimelist.net/anime/${s.malId}`,
          })),
      });
    }

    if (graph.extras.length > 0) {
      relatedGroups.push({
        relation: "Side Story / Movie",
        entry: graph.extras.map((e) => ({
          mal_id: e.malId,
          type: "anime",
          name: e.title,
          url: `https://myanimelist.net/anime/${e.malId}`,
        })),
      });
    }

    if (graph.adaptations.length > 0) {
      relatedGroups.push({
        relation: "Adaptation",
        entry: graph.adaptations.map((a) => ({
          mal_id: a.malId,
          type: "manga",
          name: a.title,
          url: `https://myanimelist.net/manga/${a.malId}`,
        })),
      });
    }

    const payload = { related: relatedGroups };
    setServerCache(cacheKey, payload);

    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Provider": "AniList",
      },
    });
  } catch {
    return Response.json({ related: [] });
  }
}
