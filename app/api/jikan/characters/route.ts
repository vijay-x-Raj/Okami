import { ensureMediaType, getCharacters } from "@/app/lib/jikan";
import { aniListCharacters } from "@/app/lib/anilist";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ characters: [] }, { status: 400 });
  }

  // 1. Try Jikan with a 2.5s timeout
  try {
    const characters = await Promise.race([
      getCharacters(type, id),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Jikan characters timeout")), 2500)
      ),
    ]);
    return Response.json(
      { characters },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    // 2. AniList characters fallback
    try {
      const characters = await aniListCharacters(type, id);
      return Response.json(
        { characters },
        {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    } catch (fallbackError) {
      return Response.json(
        { characters: [], error: fallbackError instanceof Error ? fallbackError.message : "Failed to fetch characters" },
        { status: 502 }
      );
    }
  }
}
