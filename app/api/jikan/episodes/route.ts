import { getAnimeEpisodes } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return Response.json({ episodes: [] }, { status: 200 });
  }

  try {
    const episodes = await getAnimeEpisodes(id);
    return Response.json({ episodes });
  } catch {
    return Response.json({ episodes: [] }, { status: 502 });
  }
}
