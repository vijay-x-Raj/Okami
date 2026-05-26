import { getMangaVolumes } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return Response.json({ volumes: [] }, { status: 200 });
  }

  try {
    const volumes = await getMangaVolumes(id);
    return Response.json({ volumes });
  } catch {
    return Response.json({ volumes: [] }, { status: 502 });
  }
}
