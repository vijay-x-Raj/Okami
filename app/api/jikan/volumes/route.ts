import { getMangaVolumes } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json(
      { totalVolumes: null, totalChapters: null, status: "Unknown", volumes: [], pictures: [] },
      { status: 400 }
    );
  }

  try {
    const data = await getMangaVolumes(id);
    return Response.json(
      {
        totalVolumes: data.totalVolumes,
        totalChapters: data.totalChapters,
        status: data.status,
        volumes: data.volumes,
        pictures: data.pictures,
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
        totalVolumes: null,
        totalChapters: null,
        status: "Unknown",
        volumes: [],
        pictures: [],
        error: error instanceof Error ? error.message : "Failed to fetch manga volumes",
      },
      { status: 502 }
    );
  }
}
