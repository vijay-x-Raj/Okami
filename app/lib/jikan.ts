export type MediaType = "anime" | "manga";

export type OkamiMedia = {
  id: number;
  type: MediaType;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  cover: string;
  banner?: string | null;
  year: number;
  format: string;
  genres: string[];
  themes?: string[];
  official_score: number;
  rank?: number | null;
  popularity?: number | null;
  status?: string;
  total: number | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  synopsis?: string;
  studios?: string[];
  authors?: string[];
  trailer_url?: string | null;
  streaming?: Array<{ name: string; url: string }>;
  external?: Array<{ name: string; url: string }>;
};

export type JikanEpisode = {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  title_romanji?: string | null;
  aired?: string | null;
  score?: number | null;
  filler?: boolean;
  recap?: boolean;
  forum_url?: string | null;
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
  favorites?: number;
  voiceActors: JikanVoiceActor[];
};

export interface FranchiseSeasonNode {
  malId: number;
  title: string;
  titleEnglish?: string | null;
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
  titleEnglish?: string | null;
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
  titleEnglish?: string | null;
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
  titleEnglish?: string | null;
  cover: string;
  bannerImage?: string | null;
  seasons: FranchiseSeasonNode[];
  extras: FranchiseExtraNode[];
  adaptations: FranchiseAdaptationNode[];
}

export interface MangaVolumeItem {
  volumeNumber: number;
  title: string;
  coverUrl: string;
  estimatedChapters?: string;
}

export interface MangaVolumeData {
  totalVolumes: number | null;
  totalChapters: number | null;
  status: string;
  volumes: MangaVolumeItem[];
  pictures: string[];
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

type JikanNamed = { name: string; mal_id?: number };

export type JikanItem = {
  mal_id: number;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  images?: JikanImages;
  trailer?: {
    youtube_id?: string | null;
    url?: string | null;
    embed_url?: string | null;
    images?: {
      image_url?: string | null;
      small_image_url?: string | null;
      medium_image_url?: string | null;
      large_image_url?: string | null;
      maximum_image_url?: string | null;
    };
  };
  score?: number | null;
  rank?: number | null;
  popularity?: number | null;
  status?: string | null;
  year?: number | null;
  type?: string | null;
  genres?: JikanNamed[];
  themes?: JikanNamed[];
  demographics?: JikanNamed[];
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  synopsis?: string | null;
  studios?: JikanNamed[];
  authors?: JikanNamed[];
  aired?: { from?: string | null; to?: string | null; prop?: { from?: { year?: number | null } } };
  published?: { from?: string | null; to?: string | null; prop?: { from?: { year?: number | null } } };
  relations?: JikanRelation[];
  streaming?: Array<{ name: string; url: string }>;
  external?: Array<{ name: string; url: string }>;
};

type JikanCharacterItem = {
  character?: { mal_id: number; name?: string; images?: JikanImages };
  role?: string;
  favorites?: number;
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
  if (typeof item.year === "number" && item.year > 0) return item.year;
  if (type === "anime") {
    const airedYear = item.aired?.prop?.from?.year;
    if (typeof airedYear === "number" && airedYear > 0) return airedYear;
    if (item.aired?.from) {
      const parsed = new Date(item.aired.from).getFullYear();
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  } else {
    const publishedYear = item.published?.prop?.from?.year;
    if (typeof publishedYear === "number" && publishedYear > 0) return publishedYear;
    if (item.published?.from) {
      const parsed = new Date(item.published.from).getFullYear();
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
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
  const themes = (item.themes || []).map((theme) => theme.name).filter(Boolean);
  const officialScore = typeof item.score === "number" ? item.score : 0;
  const total = type === "anime" ? item.episodes ?? null : item.chapters ?? item.volumes ?? null;

  const trailerUrl = item.trailer?.embed_url || item.trailer?.url || null;
  const banner =
    item.trailer?.images?.maximum_image_url ||
    item.trailer?.images?.large_image_url ||
    item.images?.webp?.large_image_url ||
    item.images?.jpg?.large_image_url ||
    null;

  return {
    id: item.mal_id,
    type,
    title,
    title_english: item.title_english ?? null,
    title_japanese: item.title_japanese ?? null,
    cover: pickImage(item.images),
    banner,
    year: resolveYear(item, type),
    format: resolveFormat(type, item.type),
    genres,
    themes,
    official_score: officialScore,
    rank: item.rank ?? null,
    popularity: item.popularity ?? null,
    status: item.status ?? undefined,
    total,
    episodes: item.episodes ?? null,
    chapters: item.chapters ?? null,
    volumes: item.volumes ?? null,
    synopsis: item.synopsis || "",
    studios: item.studios?.map((studio) => studio.name) || [],
    authors: item.authors?.map((author) => author.name) || [],
    trailer_url: trailerUrl,
    streaming: item.streaming || [],
    external: item.external || [],
  };
}

// ─── Mihon-Inspired Token-Bucket Rate-Limiting & Smart In-Memory Cache ───
// Enforces max 3 requests/sec token bucket with exponential backoff on HTTP 429/502/503/504
// and smart refresh gates skipping redundant network fetches for finished media.

class TokenBucketRateLimiter {
  private capacity: number;
  private tokens: number;
  private refillRatePerMs: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];

  constructor(capacity: number = 3, tokensPerSecond: number = 3) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRatePerMs = tokensPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.lastRefill);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleDrain();
    });
  }

  private scheduleDrain(): void {
    if (this.queue.length === 0) return;
    this.refill();
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
    if (this.queue.length > 0) {
      const tokensNeeded = 1 - this.tokens;
      const delayMs = Math.max(25, Math.ceil(tokensNeeded / this.refillRatePerMs));
      setTimeout(() => this.scheduleDrain(), delayMs);
    }
  }
}

const _tokenBucket = new TokenBucketRateLimiter(3, 3);

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const _memoryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getCached<T>(key: string): T | undefined {
  const entry = _memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _memoryCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): void {
  if (_memoryCache.size > 800) {
    const oldestKey = _memoryCache.keys().next().value;
    if (oldestKey) _memoryCache.delete(oldestKey);
  }
  _memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Mihon Smart Refresh Gate: Checks if a media title is finished airing/publishing */
export function isMediaFinished(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("finished") ||
    s.includes("complete") ||
    s.includes("ended") ||
    s.includes("cancelled")
  );
}

// ─── Mihon ChapterRecognition / parseMediaNumber Engine ───

export interface ParsedMediaNumber {
  number: number;
  isSpecial: boolean;
  rawString: string;
  formatted: string;
}

/**
 * Ported from Mihon's ChapterRecognition.kt
 * Normalizes episode/chapter strings (e.g., "Episode 12.5", "Ch. 104", "S2 Ep 1", "Special 01")
 * Extracting numeric values, decimal specials, and formatting clean labels.
 */
export function parseMediaNumber(
  input: string | number,
  mediaType: MediaType = "anime"
): ParsedMediaNumber {
  if (typeof input === "number") {
    const isSpecial = input % 1 !== 0;
    const prefix = mediaType === "anime" ? "Ep" : "Ch";
    return {
      number: input,
      isSpecial,
      rawString: String(input),
      formatted: `${prefix} ${input}`,
    };
  }

  const str = String(input || "").trim();
  const lower = str.toLowerCase();
  const isExplicitSpecial =
    lower.includes("special") ||
    lower.includes("recap") ||
    lower.includes("ova") ||
    lower.includes("side story") ||
    lower.includes("prologue") ||
    lower.includes("extra") ||
    lower.includes("omake");

  const match = str.match(/(?:ep(?:isode)?\.?|ch(?:apter)?\.?|#|\bv\b|\bvol\b)?\s*(\d+(?:\.\d+)?)/i);
  const num = match ? parseFloat(match[1]) : 0;
  const isSpecial = isExplicitSpecial || num % 1 !== 0;
  const prefix = mediaType === "anime" ? "Ep" : "Ch";

  return {
    number: num,
    isSpecial,
    rawString: str,
    formatted: num > 0 ? `${prefix} ${num}` : str || `${prefix} 1`,
  };
}

/**
 * Toggle formatting between Season-Relative ("S2 Ep 1") and Absolute ("Ep 26") numbering
 */
export function formatMediaNumberDisplay({
  mediaType = "anime",
  seasonNumber = 1,
  number,
  cumulativeOffset = 0,
  mode = "relative",
}: {
  mediaType?: MediaType;
  seasonNumber?: number;
  number: number;
  cumulativeOffset?: number;
  mode?: "relative" | "absolute";
}): string {
  const prefix = mediaType === "anime" ? "Ep" : "Ch";
  if (mode === "absolute" && cumulativeOffset > 0) {
    const absoluteNum = cumulativeOffset + number;
    return `${prefix} ${absoluteNum}`;
  }
  if (mediaType === "anime" && seasonNumber > 1) {
    return `S${seasonNumber} ${prefix} ${number}`;
  }
  return `${prefix} ${number}`;
}

export async function jikanFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const urlStr = url.toString();
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await _tokenBucket.acquire();

    try {
      const response = await fetch(urlStr, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.headers || {}),
        },
      });

      if (
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        if (attempt < maxRetries) {
          const retryHeader = response.headers.get("Retry-After");
          const retrySec = retryHeader ? parseFloat(retryHeader) : NaN;
          const waitMs = !Number.isNaN(retrySec)
            ? Math.max(retrySec * 1000, 1000)
            : 1000 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }

      return response;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Jikan request failed after ${maxRetries} retries`);
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const cached = getCached<T>(url);
  if (cached !== undefined) {
    return cached;
  }

  const response = await jikanFetch(url, init);
  if (!response.ok) {
    throw new Error(`Jikan request failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as T;
  setCached<T>(url, data);
  return data;
}

/** Fetch anime/manga with full details including relations (uses /full endpoint). */
export async function getFullDetail(type: MediaType, id: number): Promise<JikanItem> {
  const url = `${JIKAN_BASE}/${type}/${id}/full`;
  const data = await getJson<{ data?: JikanItem }>(url, { next: { revalidate: 86400 } });
  if (!data?.data) throw new Error(`Not found: ${type}/${id}`);
  return data.data;
}

export interface EpisodesResult {
  episodes: JikanEpisode[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

export async function getAnimeEpisodes(
  id: number,
  page: number = 1,
  options?: { status?: string; forceRefresh?: boolean }
): Promise<EpisodesResult> {
  const url = `${JIKAN_BASE}/anime/${id}/episodes?page=${Math.max(1, page)}`;

  // Mihon Smart Refresh Gate: If finished and cached, skip network fetch
  if (!options?.forceRefresh && isMediaFinished(options?.status)) {
    const cached = getCached<EpisodesResult>(url);
    if (cached) {
      return cached;
    }
  }

  const data = await getJson<{
    data?: Array<{
      mal_id: number;
      title?: string | null;
      title_japanese?: string | null;
      title_romanji?: string | null;
      aired?: string | null;
      score?: number | null;
      filler?: boolean;
      recap?: boolean;
      forum_url?: string | null;
    }>;
    pagination?: {
      last_visible_page?: number;
      has_next_page?: boolean;
    };
  }>(url, { next: { revalidate: 86400 } });

  const rawEpisodes = Array.isArray(data?.data) ? data.data : [];
  const episodes: JikanEpisode[] = rawEpisodes.map((ep) => ({
    mal_id: ep.mal_id,
    title: ep.title ?? `Episode ${ep.mal_id}`,
    title_japanese: ep.title_japanese ?? null,
    title_romanji: ep.title_romanji ?? null,
    aired: ep.aired ?? null,
    score: ep.score ?? null,
    filler: Boolean(ep.filler),
    recap: Boolean(ep.recap),
    forum_url: ep.forum_url ?? null,
  }));

  const result: EpisodesResult = {
    episodes,
    pagination: {
      last_visible_page: data?.pagination?.last_visible_page ?? 1,
      has_next_page: Boolean(data?.pagination?.has_next_page),
    },
  };

  // If media is finished, cache with longer TTL (24 hours)
  if (isMediaFinished(options?.status)) {
    setCached(url, result, 24 * 60 * 60 * 1000);
  }

  return result;
}

export async function getMangaPictures(id: number): Promise<string[]> {
  try {
    const url = `${JIKAN_BASE}/manga/${id}/pictures`;
    const data = await getJson<{ data?: Array<{ jpg?: JikanImage; webp?: JikanImage }> }>(url, {
      next: { revalidate: 86400 },
    });
    if (!Array.isArray(data?.data)) return [];
    return data.data
      .map((item) => pickImage(item))
      .filter((img): img is string => typeof img === "string" && img.length > 0);
  } catch {
    return [];
  }
}

export async function getMangaVolumes(
  id: number,
  options?: { status?: string; forceRefresh?: boolean }
): Promise<MangaVolumeData> {
  const cacheKey = `manga_volumes_${id}`;

  // Mihon Smart Refresh Gate: If finished and cached, skip network fetch
  if (!options?.forceRefresh && isMediaFinished(options?.status)) {
    const cached = getCached<MangaVolumeData>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const [detail, pictures] = await Promise.all([
    getFullDetail("manga", id),
    getMangaPictures(id),
  ]);

  const totalVolumes = detail.volumes ?? null;
  const totalChapters = detail.chapters ?? null;

  // Determine volume count: use detail.volumes, or estimate from chapters (~9 chapters per vol), minimum 1
  let volCount = totalVolumes;
  if (!volCount || volCount <= 0) {
    if (totalChapters && totalChapters > 0) {
      volCount = Math.max(1, Math.ceil(totalChapters / 9));
    } else {
      volCount = Math.max(1, pictures.length > 0 ? pictures.length : 1);
    }
  }

  const mainCover = pickImage(detail.images);
  const volumes: MangaVolumeItem[] = [];

  for (let i = 1; i <= volCount; i++) {
    // If we have enough pictures, assign individual cover, else fall back to main cover
    const coverUrl = pictures[i - 1] || mainCover;
    let estimatedChapters: string | undefined;
    if (totalChapters && totalChapters > 0) {
      const avgCh = Math.ceil(totalChapters / volCount);
      const startCh = (i - 1) * avgCh + 1;
      const endCh = Math.min(i * avgCh, totalChapters);
      estimatedChapters = `Ch. ${startCh}–${endCh}`;
    }

    volumes.push({
      volumeNumber: i,
      title: `Volume ${i}`,
      coverUrl,
      estimatedChapters,
    });
  }

  const result: MangaVolumeData = {
    totalVolumes,
    totalChapters,
    status: detail.status || "Unknown",
    volumes,
    pictures,
  };

  if (isMediaFinished(detail.status || options?.status)) {
    setCached(cacheKey, result, 24 * 60 * 60 * 1000);
  } else {
    setCached(cacheKey, result);
  }

  return result;
}

export async function getRelated(type: MediaType, id: number): Promise<JikanRelation[]> {
  const url = `${JIKAN_BASE}/${type}/${id}/relations`;
  const data = await getJson<{ data?: JikanRelation[] }>(url, { next: { revalidate: 86400 } });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getCharacters(type: MediaType, id: number): Promise<JikanCharacter[]> {
  const url = `${JIKAN_BASE}/${type}/${id}/characters`;
  const data = await getJson<{ data?: JikanCharacterItem[] }>(url, { next: { revalidate: 86400 } });
  if (!Array.isArray(data?.data)) return [];

  const parsed = data.data.map((item) => {
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
      role: item.role ?? "Supporting",
      image: pickImage(character?.images),
      favorites: item.favorites ?? 0,
      voiceActors,
    };
  });

  // Filter valid characters
  const valid = parsed.filter((item) => item.id > 0 || item.name !== "Unknown");

  // Sort: Main roles first, then by favorites descending
  return valid.sort((a, b) => {
    const aMain = a.role.toLowerCase() === "main" ? 1 : 0;
    const bMain = b.role.toLowerCase() === "main" ? 1 : 0;
    if (aMain !== bMain) return bMain - aMain;
    return (b.favorites ?? 0) - (a.favorites ?? 0);
  });
}

/** Legacy alias for backward compatibility */
export async function getAnimeCharacters(id: number): Promise<JikanCharacter[]> {
  return getCharacters("anime", id);
}

// ─── Franchise Graph Traversal Engine ───
const RELEVANT_RELATIONS = new Set([
  "sequel",
  "prequel",
  "parent story",
  "side story",
  "adaptation",
  "spin-off",
  "alternative version",
  "full story",
]);

const MAX_NODES_TO_FETCH = 12;
const MAX_DEPTH = 3;

export async function resolveFranchiseGraph(
  startId: number,
  startType: MediaType = "anime"
): Promise<FranchiseGraph> {
  const visited = new Set<string>();
  const fetchedItems = new Map<string, { item: JikanItem; mediaType: MediaType }>();

  // BFS Queue: { id, type, depth }
  const queue: Array<{ id: number; type: MediaType; depth: number }> = [
    { id: startId, type: startType, depth: 0 },
  ];
  visited.add(`${startType}:${startId}`);

  while (queue.length > 0 && fetchedItems.size < MAX_NODES_TO_FETCH) {
    const current = queue.shift()!;
    try {
      const item = await getFullDetail(current.type, current.id);
      const itemKey = `${current.type}:${current.id}`;
      fetchedItems.set(itemKey, { item, mediaType: current.type });

      if (current.depth < MAX_DEPTH) {
        const relations = item.relations || [];
        for (const rel of relations) {
          const relName = (rel.relation || "").trim().toLowerCase();
          if (!RELEVANT_RELATIONS.has(relName)) continue;

          const entries = rel.entry || [];
          for (const ent of entries) {
            const entType: MediaType = ent.type?.toLowerCase() === "manga" ? "manga" : "anime";
            const entKey = `${entType}:${ent.mal_id}`;
            if (!visited.has(entKey) && queue.length + fetchedItems.size < MAX_NODES_TO_FETCH * 2) {
              visited.add(entKey);
              queue.push({ id: ent.mal_id, type: entType, depth: current.depth + 1 });
            }
          }
        }
      }
    } catch {
      // Continue if single item fails to fetch
    }
  }

  const rawSeasons: FranchiseSeasonNode[] = [];
  const extras: FranchiseExtraNode[] = [];
  const adaptations: FranchiseAdaptationNode[] = [];

  for (const [, { item, mediaType }] of fetchedItems) {
    const title = item.title_english || item.title || item.title_japanese || "Untitled";
    const cover = pickImage(item.images);
    const year = resolveYear(item, mediaType);
    const rawType = (item.type || (mediaType === "anime" ? "TV" : "Manga")).toUpperCase();

    if (mediaType === "manga") {
      adaptations.push({
        malId: item.mal_id,
        title,
        titleEnglish: item.title_english ?? null,
        type: item.type || "Manga",
        chapters: item.chapters ?? null,
        volumes: item.volumes ?? null,
        publishedFrom: item.published?.from ?? null,
        year,
        score: item.score ?? null,
        cover,
      });
    } else {
      const isMainline = rawType === "TV" || rawType === "ONA";
      if (isMainline) {
        rawSeasons.push({
          malId: item.mal_id,
          title,
          titleEnglish: item.title_english ?? null,
          type: rawType,
          seasonNumber: 1, // Will renumber after sorting
          episodes: item.episodes ?? null,
          airedFrom: item.aired?.from ?? null,
          year,
          score: item.score ?? null,
          cover,
        });
      } else {
        extras.push({
          malId: item.mal_id,
          title,
          titleEnglish: item.title_english ?? null,
          type: item.type || "Special",
          episodes: item.episodes ?? null,
          airedFrom: item.aired?.from ?? null,
          year,
          score: item.score ?? null,
          cover,
        });
      }
    }
  }

  // Sort mainline seasons chronologically
  rawSeasons.sort((a, b) => {
    if (a.airedFrom && b.airedFrom) {
      return new Date(a.airedFrom).getTime() - new Date(b.airedFrom).getTime();
    }
    if (a.year !== b.year && a.year > 0 && b.year > 0) {
      return a.year - b.year;
    }
    return a.malId - b.malId;
  });

  const seasons = rawSeasons.map((season, index) => ({
    ...season,
    seasonNumber: index + 1,
  }));

  // Sort extras chronologically
  extras.sort((a, b) => {
    if (a.airedFrom && b.airedFrom) {
      return new Date(a.airedFrom).getTime() - new Date(b.airedFrom).getTime();
    }
    return a.year - b.year;
  });

  // Sort adaptations chronologically
  adaptations.sort((a, b) => {
    if (a.publishedFrom && b.publishedFrom) {
      return new Date(a.publishedFrom).getTime() - new Date(b.publishedFrom).getTime();
    }
    return a.year - b.year;
  });

  // Determine rootMalId:
  // 1. Earliest mainline TV season
  // 2. Earliest anime extra
  // 3. Earliest manga adaptation
  // 4. Initial startId fallback
  let rootMalId = startId;
  let rootTitle = "";
  let rootTitleEnglish: string | null = null;
  let rootCover = "";

  if (seasons.length > 0) {
    rootMalId = seasons[0].malId;
    rootTitle = seasons[0].title;
    rootTitleEnglish = seasons[0].titleEnglish ?? null;
    rootCover = seasons[0].cover;
  } else if (extras.length > 0) {
    rootMalId = extras[0].malId;
    rootTitle = extras[0].title;
    rootTitleEnglish = extras[0].titleEnglish ?? null;
    rootCover = extras[0].cover;
  } else if (adaptations.length > 0) {
    rootMalId = adaptations[0].malId;
    rootTitle = adaptations[0].title;
    rootTitleEnglish = adaptations[0].titleEnglish ?? null;
    rootCover = adaptations[0].cover;
  }

  const initialKey = `${startType}:${startId}`;
  if ((!rootTitle || !rootCover) && fetchedItems.has(initialKey)) {
    const initItem = fetchedItems.get(initialKey)!.item;
    rootTitle = rootTitle || initItem.title_english || initItem.title || initItem.title_japanese || "Untitled";
    rootTitleEnglish = rootTitleEnglish || initItem.title_english || null;
    rootCover = rootCover || pickImage(initItem.images);
  }

  const franchiseId = `franchise_${rootMalId}`;

  // Find best banner image across discovered items
  let bannerImage: string | null = null;
  for (const [, { item }] of fetchedItems) {
    if (item.trailer?.images?.maximum_image_url) {
      bannerImage = item.trailer.images.maximum_image_url;
      break;
    }
    if (item.trailer?.images?.large_image_url) {
      bannerImage = item.trailer.images.large_image_url;
      break;
    }
  }

  return {
    franchiseId,
    rootMalId,
    title: rootTitle || "Unknown Franchise",
    titleEnglish: rootTitleEnglish,
    cover: rootCover || "",
    bannerImage,
    seasons,
    extras,
    adaptations,
  };
}
