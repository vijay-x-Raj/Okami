import { ensureMediaType, getFullDetail, normalizeItem } from "@/app/lib/jikan";
import { aniListDetail } from "@/app/lib/anilist";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  // 1. Try Jikan with a quick timeout
  try {
    const rawDetail = await Promise.race([
      getFullDetail(type, id),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Jikan timeout")), 2500)
      ),
    ]);
    const data = normalizeItem(rawDetail, type);

    return Response.json(
      { data, raw: rawDetail },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    // 2. Seamless fallback to AniList
    try {
      const data = await aniListDetail(type, id);
      return Response.json(
        { data, raw: null },
        {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    } catch (fallbackError) {
      return Response.json(
        { error: fallbackError instanceof Error ? fallbackError.message : "Detail request failed." },
        { status: 502 }
      );
    }
  }
}
