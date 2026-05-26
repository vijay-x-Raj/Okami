import type { JikanEpisode, JikanRelation, MediaType, OkamiMedia } from "./jikan";

async function getJson<T>(input: RequestInfo | URL): Promise<T> {
  const response = await fetch(input, { headers: { "Content-Type": "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchMedia(
  type: MediaType,
  query: string,
  options?: { genres?: string; season?: string; studio?: string; limit?: number }
): Promise<OkamiMedia[]> {
  const url = new URL("/api/jikan/search", window.location.origin);
  url.searchParams.set("type", type);
  url.searchParams.set("q", query);
  if (options?.genres) url.searchParams.set("genres", options.genres);
  if (options?.season) url.searchParams.set("season", options.season);
  if (options?.studio) url.searchParams.set("studio", options.studio);
  if (options?.limit) url.searchParams.set("limit", String(options.limit));
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

export async function fetchEpisodes(id: number): Promise<JikanEpisode[]> {
  const url = new URL("/api/jikan/episodes", window.location.origin);
  url.searchParams.set("id", String(id));
  const data = await getJson<{ episodes: JikanEpisode[] }>(url);
  return data.episodes;
}

export async function fetchVolumes(id: number): Promise<unknown[]> {
  const url = new URL("/api/jikan/volumes", window.location.origin);
  url.searchParams.set("id", String(id));
  const data = await getJson<{ volumes: unknown[] }>(url);
  return data.volumes;
}

export async function fetchRelated(type: MediaType, id: number): Promise<JikanRelation[]> {
  const url = new URL("/api/jikan/related", window.location.origin);
  url.searchParams.set("type", type);
  url.searchParams.set("id", String(id));
  const data = await getJson<{ related: JikanRelation[] }>(url);
  return data.related;
}
