import { ensureMediaType, getRelated } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return Response.json({ related: [] }, { status: 200 });
  }

  try {
    const related = await getRelated(type, id);
    return Response.json({ related });
  } catch {
    return Response.json({ related: [] }, { status: 502 });
  }
}
