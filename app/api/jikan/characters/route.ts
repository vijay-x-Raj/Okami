import { getAnimeCharacters } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return Response.json({ characters: [] }, { status: 200 });
  }

  try {
    const characters = await getAnimeCharacters(id);
    return Response.json({ characters });
  } catch {
    return Response.json({ characters: [] }, { status: 502 });
  }
}
