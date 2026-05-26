import { JIKAN_BASE, normalizeItem, type JikanItem } from "@/app/lib/jikan";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? 12), 1, 25);
  const apiUrl = new URL(`${JIKAN_BASE}/seasons/now`);
  apiUrl.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } });
    if (!response.ok) {
      return Response.json({ error: "Jikan request failed." }, { status: 502 });
    }
    const payload = (await response.json()) as { data?: JikanItem[] };
    const data = Array.isArray(payload?.data) ? payload.data.map((item) => normalizeItem(item, "anime")) : [];
    return Response.json({ data });
  } catch {
    return Response.json({ error: "Jikan request failed." }, { status: 502 });
  }
}
