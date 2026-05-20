import type { MediaType, OkamiMedia } from "./jikan";

async function getJson<T>(input: RequestInfo | URL): Promise<T> {
  const response = await fetch(input, { headers: { "Content-Type": "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchMedia(type: MediaType, query: string): Promise<OkamiMedia[]> {
  const url = new URL("/api/jikan/search", window.location.origin);
  url.searchParams.set("type", type);
  url.searchParams.set("q", query);
  const data = await getJson<{ data: OkamiMedia[] }>(url);
  return data.data;
}

export async function fetchTop(type: MediaType): Promise<OkamiMedia[]> {
  const url = new URL("/api/jikan/top", window.location.origin);
  url.searchParams.set("type", type);
  const data = await getJson<{ data: OkamiMedia[] }>(url);
  return data.data;
}

export async function fetchSeason(): Promise<OkamiMedia[]> {
  const url = new URL("/api/jikan/season", window.location.origin);
  const data = await getJson<{ data: OkamiMedia[] }>(url);
  return data.data;
}

export async function fetchDetail(type: MediaType, id: number): Promise<OkamiMedia> {
  const url = new URL("/api/jikan/detail", window.location.origin);
  url.searchParams.set("type", type);
  url.searchParams.set("id", String(id));
  const data = await getJson<{ data: OkamiMedia }>(url);
  return data.data;
}
