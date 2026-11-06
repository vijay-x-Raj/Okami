import { ensureMediaType, getRelated } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ related: [] }, { status: 400 });
  }

  try {
    const related = await getRelated(type, id);
    return Response.json(
      { related },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    return Response.json(
      { related: [], error: error instanceof Error ? error.message : "Failed to fetch relations" },
      { status: 502 }
    );
  }
}
