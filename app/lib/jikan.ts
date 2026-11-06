export type MediaType = "anime" | "manga";

export type OkamiMedia = {
  id: number;
  type: MediaType;
  title: string;
  cover: string;
  year: number;
  format: string;
  genres: string[];
  official_score: number;
  total: number | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  synopsis?: string;
  studios?: string[];
  authors?: string[];
};

export type JikanEpisode = {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  duration?: string | null;
};

export type JikanRelation = {
  relation?: string | null;
  entry?: Array<{ mal_id: number; type?: string; name?: string }>;
};

export type JikanVoiceActor = {
  id: number;
  name: string;
  language?: string;
  image: string;
};

export type JikanCharacter = {
  id: number;
  name: string;
  role?: string;
  image: string;
  voiceActors: JikanVoiceActor[];
};

export interface FranchiseSeasonNode {
  malId: number;
  title: string;
  type: string;
  seasonNumber: number;
  episodes: number | null;
  airedFrom: string | null;
  year: number;
  score: number | null;
  cover: string;
}

export interface FranchiseExtraNode {
  malId: number;
  title: string;
  type: string;
  episodes: number | null;
  airedFrom: string | null;
  year: number;
  score: number | null;
  cover: string;
}

export interface FranchiseAdaptationNode {
  malId: number;
  title: string;
  type: string;
  chapters: number | null;
  volumes: number | null;
  publishedFrom: string | null;
  year: number;
  score: number | null;
  cover: string;
}

export interface FranchiseGraph {
  franchiseId: string;
  rootMalId: number;
  title: string;
  cover: string;
  seasons: FranchiseSeasonNode[];
  extras: FranchiseExtraNode[];
  adaptations: FranchiseAdaptationNode[];
}

type JikanImage = {
  image_url?: string;
  small_image_url?: string;
  large_image_url?: string;
};

type JikanImages = {
  jpg?: JikanImage;
  webp?: JikanImage;
};

type JikanNamed = { name: string };

export type JikanItem = {
  mal_id: number;
  title?: string;
  title_english?: string;
  title_japanese?: string;
  images?: JikanImages;
  score?: number | null;
  year?: number | null;
  type?: string | null;
  genres?: JikanNamed[];
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  synopsis?: string | null;
  studios?: JikanNamed[];
  authors?: JikanNamed[];
  aired?: { from?: string | null; prop?: { from?: { year?: number | null } } };
  published?: { from?: string | null; prop?: { from?: { year?: number | null } } };
  relations?: JikanRelation[];
};

type JikanCharacterItem = {
  character?: { mal_id: number; name?: string; images?: JikanImages };
  role?: string;
  voice_actors?: Array<{
    person?: { mal_id: number; name?: string; images?: JikanImages };
    language?: string;
  }>;
};

export const JIKAN_BASE = "https://api.jikan.moe/v4";

const ANIME_FORMAT: Record<string, string> = {
  TV: "TV Series",
  Movie: "Film",
  OVA: "OVA",
  ONA: "ONA",
  Special: "Special",
  TV_Special: "TV Special",
  Music: "Music",
};

const MANGA_FORMAT: Record<string, string> = {
  Manga: "Manga",
  "Light Novel": "Light Novel",
  "One-shot": "One Shot",
  Novel: "Novel",
  Doujinshi: "Doujinshi",
  Manhwa: "Manhwa",
  Manhua: "Manhua",
  OEL: "OEL",
};

export function ensureMediaType(value?: string | null): MediaType {
  return value === "manga" ? "manga" : "anime";
}

export function pickImage(images?: JikanImages): string {
  if (!images) return "";
  return (
    images.webp?.large_image_url ||
    images.webp?.image_url ||
    images.jpg?.large_image_url ||
    images.jpg?.image_url ||
    images.jpg?.small_image_url ||
    ""
  );
}

function resolveYear(item: JikanItem, type: MediaType): number {
  if (typeof item.year === "number") return item.year;
  if (type === "anime") {
    const airedYear = item.aired?.prop?.from?.year;
    return typeof airedYear === "number" ? airedYear : 0;
  }
  const publishedYear = item.published?.prop?.from?.year;
  return typeof publishedYear === "number" ? publishedYear : 0;
}

function resolveFormat(type: MediaType, rawType?: string | null): string {
  if (!rawType) return type === "anime" ? "TV Series" : "Manga";
  if (type === "anime") {
    return ANIME_FORMAT[rawType] || rawType;
  }
  return MANGA_FORMAT[rawType] || rawType;
}

export function normalizeItem(item: JikanItem, type: MediaType): OkamiMedia {
  const title = item.title_english || item.title || item.title_japanese || "Untitled";
  const genres = (item.genres || []).map((genre) => genre.name).filter(Boolean);
  const officialScore = typeof item.score === "number" ? item.score : 0;
  const total = type === "anime" ? item.episodes ?? null : item.chapters ?? item.volumes ?? null;

  return {
    id: item.mal_id,
    type,
    title,
    cover: pickImage(item.images),
    year: resolveYear(item, type),
    format: resolveFormat(type, item.type),
    genres,
    official_score: officialScore,
    total,
    episodes: item.episodes ?? null,
    chapters: item.chapters ?? null,
    volumes: item.volumes ?? null,
    synopsis: item.synopsis || "",
    studios: item.studios?.map((studio) => studio.name) || [],
    authors: item.authors?.map((author) => author.name) || [],
  };
}

// ─── Jikan Rate-Limiting Queue ───
// Enforces minimum 350ms between outbound requests to api.jikan.moe
// with automatic retry on HTTP 429 (Too Many Requests).
let _jikanQueueTail: Promise<void> = Promise.resolve();
const JIKAN_MIN_INTERVAL_MS = 350;

export async function jikanFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const previousTail = _jikanQueueTail;
  let release!: () => void;
  _jikanQueueTail = new Promise<void>((r) => {
    release = r;
  });

  await previousTail;

  try {
    let response = await fetch(url.toString(), init);

    if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
      const retryAfter = Number(response.headers.get("Retry-After") || "1.5");
      const waitMs = Math.max(retryAfter * 1000, 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      response = await fetch(url.toString(), init);
    }

    return response;
  } finally {
    setTimeout(() => release(), JIKAN_MIN_INTERVAL_MS);
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await jikanFetch(url, init);
  if (!response.ok) {
    throw new Error(`Jikan request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getAnimeEpisodes(id: number): Promise<JikanEpisode[]> {
  const url = `${JIKAN_BASE}/anime/${id}/episodes`;
  const data = await getJson<{ data?: JikanEpisode[] }>(url, { next: { revalidate: 86400 } });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getMangaVolumes(id: number): Promise<unknown[]> {
  const url = `${JIKAN_BASE}/manga/${id}/characters`;
  const data = await getJson<{ data?: unknown[] }>(url, { next: { revalidate: 86400 } });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getRelated(type: MediaType, id: number): Promise<JikanRelation[]> {
  const url = `${JIKAN_BASE}/${type}/${id}/relations`;
  const data = await getJson<{ data?: JikanRelation[] }>(url, { next: { revalidate: 86400 } });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getAnimeCharacters(id: number): Promise<JikanCharacter[]> {
  const url = `${JIKAN_BASE}/anime/${id}/characters`;
  const data = await getJson<{ data?: JikanCharacterItem[] }>(url, { next: { revalidate: 86400 } });
  if (!Array.isArray(data?.data)) return [];
  return data.data
    .map((item) => {
      const character = item.character;
      const voiceActors = (item.voice_actors || []).map((actor) => ({
        id: actor.person?.mal_id ?? 0,
        name: actor.person?.name ?? "Unknown",
        language: actor.language ?? "",
        image: pickImage(actor.person?.images),
      }));
      return {
        id: character?.mal_id ?? 0,
        name: character?.name ?? "Unknown",
        role: item.role ?? "",
        image: pickImage(character?.images),
        voiceActors,
      };
    })
    .filter((item) => item.id > 0 || item.name !== "Unknown");
}

/** Fetch anime/manga with full details including relations (uses /full endpoint). */
export async function getFullDetail(type: MediaType, id: number): Promise<JikanItem> {
  const url = `${JIKAN_BASE}/${type}/${id}/full`;
  const data = await getJson<{ data?: JikanItem }>(url, { next: { revalidate: 86400 } });
  if (!data?.data) throw new Error(`Not found: ${type}/${id}`);
  return data.data;
}
