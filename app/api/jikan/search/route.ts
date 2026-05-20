import { JIKAN_BASE, ensureMediaType, normalizeItem } from "@/app/lib/jikan";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = clamp(Number(url.searchParams.get("limit") ?? 20), 1, 25);

  if (!query) {
    return Response.json({ data: [] });
  }

  const apiUrl = new URL(`${JIKAN_BASE}/${type}`);
  apiUrl.searchParams.set("q", query);
  apiUrl.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(apiUrl, { cache: "no-store" });
    if (!response.ok) {
      return Response.json({ error: "Jikan request failed." }, { status: 502 });
    }
    const payload = await response.json();
    const data = Array.isArray(payload?.data) ? payload.data.map((item: any) => normalizeItem(item, type)) : [];
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: "Jikan request failed." }, { status: 502 });
  }
}
