import type {
  FranchiseGraph,
  JikanCharacter,
  JikanEpisode,
  JikanRelation,
  MangaVolumeData,
  MangaVolumeItem,
  MediaType,
  OkamiMedia,
} from "./jikan";

export type { MangaVolumeData, MangaVolumeItem };

// Backward compatibility alias
export interface VolumeData {
  mal_id: number;
  volume_number: number;
  title: string;
}

export interface FetchEpisodesResponse {
  episodes: JikanEpisode[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

interface ClientCacheItem<T> {
  data: T;
  timestamp: number;
}

const _clientCache = new Map<string, ClientCacheItem<unknown>>();
const _inFlight = new Map<string, Promise<unknown>>();
const CLIENT_DEFAULT_TTL = 20 * 60 * 1000; // 20 minutes

async function getJson<T>(input: RequestInfo | URL, init?: RequestInit, ttlMs: number = CLIENT_DEFAULT_TTL): Promise<T> {
  const key = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

  const cached = _clientCache.get(key);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data as T;
  }

  const inFlightPromise = _inFlight.get(key);
  if (inFlightPromise) {
    return inFlightPromise as Promise<T>;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(input, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const data = (await response.json()) as T;
      _clientCache.set(key, { data, timestamp: Date.now() });
      return data;
    } finally {
      _inFlight.delete(key);
    }
  })();

  _inFlight.set(key, fetchPromise);
  return fetchPromise;
}

export function prefetchMedia(type: MediaType, id: number): void {
  if (typeof window === "undefined") return;
  fetchDetail(type, id).catch(() => {});
  fetchFranchiseGraph(id, type).catch(() => {});
}

export async function searchMedia(
  type: MediaType,
  query: string,
  options?: {
    genres?: string;
    season?: string;
    studio?: string;
    sort?: string;
    format?: string;
    status?: string;
    year?: number;
    page?: number;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<{ data: OkamiMedia[]; pagination?: { last_visible_page: number; has_next_page: boolean; total?: number } }> {
  const url = new URL("/api/jikan/search", window.location.origin);
  url.searchParams.set("type", type);
  if (query) url.searchParams.set("q", query);
  if (options?.genres) url.searchParams.set("genres", options.genres);
  if (options?.season) url.searchParams.set("season", options.season);
  if (options?.studio) url.searchParams.set("studio", options.studio);
  if (options?.sort) url.searchParams.set("sort", options.sort);
  if (options?.format) url.searchParams.set("format", options.format);
  if (options?.status) url.searchParams.set("status", options.status);
  if (options?.year) url.searchParams.set("year", String(options.year));
  if (options?.page) url.searchParams.set("page", String(options.page));
  if (options?.limit) url.searchParams.set("limit", String(options.limit));

  return getJson<{ data: OkamiMedia[]; pagination?: { last_visible_page: number; has_next_page: boolean; total?: number } }>(
    url,
    { signal: options?.signal }
  );
}

export async function fetchTop(
  type: MediaType,
  options?: { page?: number; limit?: number; filter?: string }
): Promise<OkamiMedia[]> {
  const res = await fetchTopDetailed(type, options);
  return res.data;
}

export async function fetchTopDetailed(
  type: MediaType,
  options?: { page?: number; limit?: number; filter?: string }
): Promise<{ data: OkamiMedia[]; pagination?: { last_visible_page: number; has_next_page: boolean; total?: number } }> {
  const url = new URL("/api/jikan/top", window.location.origin);
  url.searchParams.set("type", type);
  if (options?.page) url.searchParams.set("page", String(options.page));
  if (options?.limit) url.searchParams.set("limit", String(options.limit));
  if (options?.filter) url.searchParams.set("filter", options.filter);
  const data = await getJson<{ data: OkamiMedia[]; pagination?: { last_visible_page: number; has_next_page: boolean; total?: number } }>(url);
  return { data: data.data || [], pagination: data.pagination };
}

export async function fetchSeason(options?: { page?: number; limit?: number }): Promise<OkamiMedia[]> {
  const res = await fetchSeasonDetailed(options);
  return res.data;
}

export async function fetchSeasonDetailed(options?: { page?: number; limit?: number }): Promise<{
  data: OkamiMedia[];
  pagination?: { last_visible_page: number; has_next_page: boolean; total?: number };
}> {
  const url = new URL("/api/jikan/season", window.location.origin);
  if (options?.page) url.searchParams.set("page", String(options.page));
  if (options?.limit) url.searchParams.set("limit", String(options.limit));
  const data = await getJson<{ data: OkamiMedia[]; pagination?: { last_visible_page: number; has_next_page: boolean; total?: number } }>(url);
  return { data: data.data || [], pagination: data.pagination };
}

export async function fetchDetail(type: MediaType, id: number): Promise<OkamiMedia> {
  const url = new URL("/api/jikan/detail", window.location.origin);
  url.searchParams.set("type", type);
  url.searchParams.set("id", String(id));
  const data = await getJson<{ data: OkamiMedia }>(url);
  return data.data;
}

export async function fetchEpisodes(
  id: number,
  page: number = 1,
  options?: { total?: number; status?: string; forceRefresh?: boolean } | number
): Promise<FetchEpisodesResponse> {
  const url = new URL("/api/jikan/episodes", window.location.origin);
  url.searchParams.set("id", String(id));
  url.searchParams.set("page", String(page));
  if (typeof options === "number") {
    if (options > 0) url.searchParams.set("total", String(options));
  } else if (options) {
    if (options.total) url.searchParams.set("total", String(options.total));
    if (options.status) url.searchParams.set("status", options.status);
    if (options.forceRefresh) url.searchParams.set("forceRefresh", "true");
  }

  const data = await getJson<{
    episodes: JikanEpisode[];
    pagination?: { last_visible_page: number; has_next_page: boolean };
  }>(url);

  return {
    episodes: data.episodes || [],
    pagination: data.pagination || { last_visible_page: 1, has_next_page: false },
  };
}

export async function fetchVolumes(
  id: number,
  options?: { status?: string; forceRefresh?: boolean }
): Promise<MangaVolumeData> {
  const url = new URL("/api/jikan/volumes", window.location.origin);
  url.searchParams.set("id", String(id));
  if (options?.status) url.searchParams.set("status", options.status);
  if (options?.forceRefresh) url.searchParams.set("forceRefresh", "true");
  return getJson<MangaVolumeData>(url);
}

export async function fetchRelated(type: MediaType, id: number): Promise<JikanRelation[]> {
  const url = new URL("/api/jikan/related", window.location.origin);
  url.searchParams.set("type", type);
  url.searchParams.set("id", String(id));
  const data = await getJson<{ related: JikanRelation[] }>(url);
  return data.related || [];
}

export async function fetchCharacters(
  id: number,
  type: MediaType = "anime"
): Promise<JikanCharacter[]> {
  const url = new URL("/api/jikan/characters", window.location.origin);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", type);
  const data = await getJson<{ characters: JikanCharacter[] }>(url);
  return data.characters || [];
}

export async function fetchFranchiseGraph(
  id: number,
  type: MediaType = "anime"
): Promise<FranchiseGraph> {
  const url = new URL("/api/jikan/franchise", window.location.origin);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", type);
  const data = await getJson<{ data: FranchiseGraph }>(url);
  return data.data;
}
