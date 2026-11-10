import { ensureMediaType, getFullDetail, normalizeItem } from "@/app/lib/jikan";
import { aniListDetail } from "@/app/lib/anilist";
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
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  const cacheKey = `detail:${type}:${id}`;
  const cached = getServerCache<{ data: unknown; raw: unknown }>(cacheKey);
  if (cached) {
    return Response.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Cache": "HIT",
      },
    });
  }

  // 1. If Jikan is healthy, try it with an 800ms budget
  if (isJikanAvailable()) {
    try {
      const rawDetail = await Promise.race([
        getFullDetail(type, id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Jikan timeout")), 800)
        ),
      ]);
      const data = normalizeItem(rawDetail, type);
      reportJikanSuccess();
      const payload = { data, raw: rawDetail };
      setServerCache(cacheKey, payload);

      return Response.json(payload, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Okami-Cache": "MISS",
        },
      });
    } catch {
      reportJikanFailure();
    }
  }

  // 2. High-speed AniList fallback (~200ms)
  try {
    const data = await aniListDetail(type, id);
    const payload = { data, raw: null };
    setServerCache(cacheKey, payload);

    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Okami-Provider": "AniList",
      },
    });
  } catch (fallbackError) {
    return Response.json(
      { error: fallbackError instanceof Error ? fallbackError.message : "Detail request failed." },
      { status: 502 }
    );
  }
}
