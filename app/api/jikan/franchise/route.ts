import { ensureMediaType, resolveFranchiseGraph } from "@/app/lib/jikan";
import { aniListFranchise } from "@/app/lib/anilist";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  // 1. Try Jikan with a 2.5s timeout
  try {
    const graph = await Promise.race([
      resolveFranchiseGraph(id, type),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Jikan franchise timeout")), 2500)
      ),
    ]);

    return Response.json(
      {
        data: graph,
        franchiseId: graph.franchiseId,
        rootMalId: graph.rootMalId,
        title: graph.title,
        coverImage: graph.cover,
        bannerImage: graph.bannerImage,
        mainSeasons: graph.seasons,
        moviesAndOvas: graph.extras,
        mangaAdaptations: graph.adaptations,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    // 2. Seamless AniList franchise fallback
    try {
      const graph = await aniListFranchise(type, id);
      return Response.json(
        {
          data: graph,
          franchiseId: graph.franchiseId,
          rootMalId: graph.rootMalId,
          title: graph.title,
          coverImage: graph.cover,
          bannerImage: graph.bannerImage,
          mainSeasons: graph.seasons,
          moviesAndOvas: graph.extras,
          mangaAdaptations: graph.adaptations,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    } catch (fallbackError) {
      return Response.json(
        { error: fallbackError instanceof Error ? fallbackError.message : "Failed to resolve franchise graph" },
        { status: 502 }
      );
    }
  }
}
