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
  synopsis?: string;
  studios?: string[];
  authors?: string[];
};

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

type JikanItem = {
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
  aired?: { prop?: { from?: { year?: number | null } } };
  published?: { prop?: { from?: { year?: number | null } } };
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
    synopsis: item.synopsis || "",
    studios: item.studios?.map((studio) => studio.name) || [],
    authors: item.authors?.map((author) => author.name) || [],
  };
}
