import { ensureMediaType, resolveFranchiseGraph } from "@/app/lib/jikan";
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
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const cacheKey = `franchise:${type}:${id}`;
  const cached = getServerCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return Response.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Cache": "HIT",
      },
    });
  }

  // 1. Primary: High-speed AniList franchise graph (~250ms single GraphQL call)
  try {
    const graph = await aniListFranchise(type, id);
    const payload = {
      data: graph,
      franchiseId: graph.franchiseId,
      rootMalId: graph.rootMalId,
      title: graph.title,
      coverImage: graph.cover,
      bannerImage: graph.bannerImage,
      mainSeasons: graph.seasons,
      moviesAndOvas: graph.extras,
      mangaAdaptations: graph.adaptations,
    };
    setServerCache(cacheKey, payload);

    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Provider": "AniList",
      },
    });
  } catch {
    // 2. Fallback to Jikan if AniList doesn't have the entry
    if (isJikanAvailable()) {
      try {
        const graph = await Promise.race([
          resolveFranchiseGraph(id, type),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Jikan franchise timeout")), 1200)
          ),
        ]);
        reportJikanSuccess();
        const payload = {
          data: graph,
          franchiseId: graph.franchiseId,
          rootMalId: graph.rootMalId,
          title: graph.title,
          coverImage: graph.cover,
          bannerImage: graph.bannerImage,
          mainSeasons: graph.seasons,
          moviesAndOvas: graph.extras,
          mangaAdaptations: graph.adaptations,
        };
        setServerCache(cacheKey, payload);

        return Response.json(payload, {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            "X-Okami-Provider": "Jikan",
          },
        });
      } catch (err) {
        reportJikanFailure();
        return Response.json(
          { error: err instanceof Error ? err.message : "Failed to resolve franchise graph" },
          { status: 502 }
        );
      }
    } else {
      return Response.json(
        { error: "Franchise graph service temporarily unavailable" },
        { status: 503 }
      );
    }
  }
}
