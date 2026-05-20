import { JIKAN_BASE, ensureMediaType, normalizeItem } from "@/app/lib/jikan";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  const apiUrl = new URL(`${JIKAN_BASE}/${type}/${id}`);

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } });
    if (!response.ok) {
      return Response.json({ error: "Jikan request failed." }, { status: 502 });
    }
    const payload = await response.json();
    if (!payload?.data) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    const data = normalizeItem(payload.data, type);
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: "Jikan request failed." }, { status: 502 });
  }
}
