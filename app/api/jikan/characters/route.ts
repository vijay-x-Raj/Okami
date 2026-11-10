import { ensureMediaType, getCharacters } from "@/app/lib/jikan";
import { aniListCharacters } from "@/app/lib/anilist";
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
    return Response.json({ characters: [] }, { status: 400 });
  }

  const cacheKey = `characters:${type}:${id}`;
  const cached = getServerCache<{ characters: unknown[] }>(cacheKey);
  if (cached) {
    return Response.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Cache": "HIT",
      },
    });
  }

  // 1. Fast AniList character cast (~200ms)
  try {
    const characters = await aniListCharacters(type, id);
    if (characters && characters.length > 0) {
      const payload = { characters };
      setServerCache(cacheKey, payload);
      return Response.json(payload, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Okami-Provider": "AniList",
        },
      });
    }
  } catch {
    // Continue to Jikan
  }

  // 2. Jikan characters with 800ms budget
  if (isJikanAvailable()) {
    try {
      const characters = await Promise.race([
        getCharacters(type, id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Jikan characters timeout")), 800)
        ),
      ]);
      reportJikanSuccess();
      const payload = { characters };
      setServerCache(cacheKey, payload);
      return Response.json(payload, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Okami-Provider": "Jikan",
        },
      });
    } catch {
      reportJikanFailure();
    }
  }

  return Response.json({ characters: [] });
}
