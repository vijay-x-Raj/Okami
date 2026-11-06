import type { MediaType } from "./jikan";

// ─── Legacy Types (backward compatible) ───

export type OkamiStatus = "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";

export type OkamiEntry = {
  id: number;
  type: MediaType;
  title: string;
  cover: string;
  year: number;
  format: string;
  genres: string[];
  official_score: number;
  user_score: number | null;
  status: OkamiStatus;
  progress: number;
  total: number | null;
  completed_seasons?: number[];
  completed_volumes?: number[];
  completed_episodes?: number[];
  date_added: string;
  notes: string;
  is_favourite: boolean;
};

const STORAGE_KEY = "okami_entries";

// ─── Legacy Helpers (preserved for backward compatibility) ───

export function loadEntries(): OkamiEntry[] {
  return readEntries();
}

export function readEntries(): OkamiEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OkamiEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: OkamiEntry[]): void {
  writeEntries(entries);
}

export function writeEntries(entries: OkamiEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  const exists = entries.some((existing) => existing.id === entry.id && existing.type === entry.type);
  if (exists) return entries;
  return [...entries, { ...entry, date_added: new Date().toISOString() }];
}

export function upsertEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id && existing.type === entry.type);
  if (index === -1) return [entry, ...entries];
  const next = [...entries];
  next[index] = entry;
  return next;
}

export function updateEntry(
  entries: OkamiEntry[],
  id: number,
  type: MediaType,
  patch: Partial<OkamiEntry>
): OkamiEntry[] {
  return entries.map((entry) =>
    entry.id === id && entry.type === type ? { ...entry, ...patch } : entry
  );
}

export function removeEntry(entries: OkamiEntry[], id: number, type: MediaType): OkamiEntry[] {
  return entries.filter((entry) => !(entry.id === id && entry.type === type));
}

export function toggleFavourite(entries: OkamiEntry[], id: number, type: MediaType): OkamiEntry[] {
  return entries.map((entry) =>
    entry.id === id && entry.type === type
      ? { ...entry, is_favourite: !entry.is_favourite }
      : entry
  );
}

// ─── Unified Franchise Types ───

export type WatchStatus = "WATCHING" | "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLAN_TO_WATCH";
export type ReadStatus = "READING" | "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLAN_TO_READ";

export interface SeasonProgress {
  malId: number;
  title: string;
  type: "TV" | "Movie" | "OVA" | "Special" | "ONA";
  seasonNumber: number;
  episodesWatched: number;
  totalEpisodes: number;
  status: WatchStatus;
  score?: number;
}

export interface MangaProgress {
  malId: number;
  title: string;
  chaptersRead: number;
  totalChapters: number | null;
  volumesRead: number;
  totalVolumes: number | null;
  status: ReadStatus;
  score?: number;
}

export interface UnifiedFranchiseEntry {
  franchiseId: string;
  rootMalId: number;
  title: string;
  coverImage: string;
  updatedAt: number;
  activeSeasonMalId?: number;
  anime?: {
    overallStatus: WatchStatus;
    seasons: Record<number, SeasonProgress>;
  };
  manga?: Record<number, MangaProgress>;
}

const FRANCHISE_STORAGE_KEY = "okami_franchises";

// ─── Franchise Storage Helpers ───

export function loadFranchiseEntries(): Record<string, UnifiedFranchiseEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FRANCHISE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFranchiseEntries(entries: Record<string, UnifiedFranchiseEntry>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FRANCHISE_STORAGE_KEY, JSON.stringify(entries));
}

export function getFranchiseEntry(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string
): UnifiedFranchiseEntry | undefined {
  return entries[franchiseId];
}

export function findFranchiseByMalId(
  entries: Record<string, UnifiedFranchiseEntry>,
  malId: number
): UnifiedFranchiseEntry | undefined {
  return Object.values(entries).find((f) => {
    if (f.rootMalId === malId) return true;
    if (f.anime) {
      for (const seasonId of Object.keys(f.anime.seasons)) {
        if (Number(seasonId) === malId) return true;
      }
    }
    if (f.manga) {
      for (const mangaId of Object.keys(f.manga)) {
        if (Number(mangaId) === malId) return true;
      }
    }
    return false;
  });
}

export function upsertFranchiseEntry(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchise: UnifiedFranchiseEntry
): Record<string, UnifiedFranchiseEntry> {
  return { ...entries, [franchise.franchiseId]: { ...franchise, updatedAt: Date.now() } };
}

export function removeFranchiseEntry(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string
): Record<string, UnifiedFranchiseEntry> {
  const next = { ...entries };
  delete next[franchiseId];
  return next;
}

// ─── Episode Increment with Auto-Rollup ───

export function incrementEpisode(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  seasonMalId: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.anime?.seasons[seasonMalId]) return entries;

  const season = { ...franchise.anime.seasons[seasonMalId] };
  const maxEps = season.totalEpisodes > 0 ? season.totalEpisodes : Infinity;
  season.episodesWatched = Math.min(season.episodesWatched + 1, maxEps);

  // Start watching if it was planned
  if (season.status === "PLAN_TO_WATCH" && season.episodesWatched > 0) {
    season.status = "WATCHING";
  }

  // Auto-complete season when all episodes watched
  if (season.totalEpisodes > 0 && season.episodesWatched >= season.totalEpisodes) {
    season.status = "COMPLETED";
  }

  const newSeasons = { ...franchise.anime.seasons, [seasonMalId]: season };

  // Auto-advance active season to next chronological season if current completed
  let activeSeasonMalId = franchise.activeSeasonMalId;
  if (season.status === "COMPLETED" && activeSeasonMalId === seasonMalId) {
    const sortedSeasons = Object.values(newSeasons).sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
    const nextSeason = sortedSeasons.find(
      (s) => s.seasonNumber > season.seasonNumber && s.status !== "COMPLETED"
    );
    if (nextSeason) {
      activeSeasonMalId = nextSeason.malId;
      // Auto-set next season to WATCHING
      newSeasons[nextSeason.malId] = { ...newSeasons[nextSeason.malId], status: "WATCHING" };
    }
  }

  // Check overall completion
  const allCompleted = Object.values(newSeasons).every((s) => s.status === "COMPLETED");
  const overallStatus: WatchStatus = allCompleted
    ? "COMPLETED"
    : franchise.anime.overallStatus === "PLAN_TO_WATCH"
      ? "WATCHING"
      : franchise.anime.overallStatus;

  return {
    ...entries,
    [franchiseId]: {
      ...franchise,
      activeSeasonMalId,
      updatedAt: Date.now(),
      anime: {
        ...franchise.anime,
        overallStatus,
        seasons: newSeasons,
      },
    },
  };
}

// ─── Manga Progress Update ───

export function updateMangaProgress(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  mangaMalId: number,
  patch: { chaptersRead?: number; volumesRead?: number; status?: ReadStatus }
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.manga?.[mangaMalId]) return entries;

  const manga = { ...franchise.manga[mangaMalId], ...patch };

  // Start reading if it was planned
  if (manga.status === "PLAN_TO_READ" && (manga.chaptersRead > 0 || manga.volumesRead > 0)) {
    manga.status = "READING";
  }

  // Auto-complete when all chapters read
  if (
    manga.totalChapters !== null &&
    manga.totalChapters > 0 &&
    manga.chaptersRead >= manga.totalChapters
  ) {
    manga.status = "COMPLETED";
  }

  return {
    ...entries,
    [franchiseId]: {
      ...franchise,
      updatedAt: Date.now(),
      manga: {
        ...franchise.manga,
        [mangaMalId]: manga,
      },
    },
  };
}

export function incrementChapter(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  mangaMalId: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.manga?.[mangaMalId]) return entries;

  const manga = franchise.manga[mangaMalId];
  const maxCh = manga.totalChapters !== null && manga.totalChapters > 0 ? manga.totalChapters : Infinity;
  return updateMangaProgress(entries, franchiseId, mangaMalId, {
    chaptersRead: Math.min(manga.chaptersRead + 1, maxCh),
  });
}

export function incrementVolume(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  mangaMalId: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.manga?.[mangaMalId]) return entries;

  const manga = franchise.manga[mangaMalId];
  const maxVol = manga.totalVolumes !== null && manga.totalVolumes > 0 ? manga.totalVolumes : Infinity;
  return updateMangaProgress(entries, franchiseId, mangaMalId, {
    volumesRead: Math.min(manga.volumesRead + 1, maxVol),
  });
}

// ─── Legacy ↔ Franchise Status Mapping ───

function mapLegacyToWatchStatus(status: OkamiStatus): WatchStatus {
  const map: Record<OkamiStatus, WatchStatus> = {
    watching: "WATCHING",
    completed: "COMPLETED",
    on_hold: "ON_HOLD",
    dropped: "DROPPED",
    plan_to_watch: "PLAN_TO_WATCH",
  };
  return map[status] ?? "PLAN_TO_WATCH";
}

function mapLegacyToReadStatus(status: OkamiStatus): ReadStatus {
  const map: Record<OkamiStatus, ReadStatus> = {
    watching: "READING",
    completed: "COMPLETED",
    on_hold: "ON_HOLD",
    dropped: "DROPPED",
    plan_to_watch: "PLAN_TO_READ",
  };
  return map[status] ?? "PLAN_TO_READ";
}

export function mapWatchStatusToLegacy(status: WatchStatus): OkamiStatus {
  const map: Record<WatchStatus, OkamiStatus> = {
    WATCHING: "watching",
    COMPLETED: "completed",
    ON_HOLD: "on_hold",
    DROPPED: "dropped",
    PLAN_TO_WATCH: "plan_to_watch",
  };
  return map[status] ?? "plan_to_watch";
}

export function mapReadStatusToLegacy(status: ReadStatus): OkamiStatus {
  const map: Record<ReadStatus, OkamiStatus> = {
    READING: "watching",
    COMPLETED: "completed",
    ON_HOLD: "on_hold",
    DROPPED: "dropped",
    PLAN_TO_READ: "plan_to_watch",
  };
  return map[status] ?? "plan_to_watch";
}

// ─── Migration: Legacy → Unified Franchise ───

function resolveFormatType(format: string): "TV" | "Movie" | "OVA" | "Special" | "ONA" {
  if (format === "Film" || format === "Movie") return "Movie";
  if (format === "OVA") return "OVA";
  if (format === "ONA") return "ONA";
  if (format === "Special" || format === "TV Special") return "Special";
  return "TV";
}

export function migrateLegacyEntries(): void {
  if (typeof window === "undefined") return;

  const migrated = window.localStorage.getItem("okami_migration_v2");
  if (migrated === "done") return;

  const legacyEntries = loadEntries();
  if (legacyEntries.length === 0) {
    window.localStorage.setItem("okami_migration_v2", "done");
    return;
  }

  const franchises = loadFranchiseEntries();

  for (const entry of legacyEntries) {
    const franchiseId = `franchise_${entry.id}`;
    if (franchises[franchiseId]) continue;

    if (entry.type === "anime") {
      const watchStatus = mapLegacyToWatchStatus(entry.status);
      franchises[franchiseId] = {
        franchiseId,
        rootMalId: entry.id,
        title: entry.title,
        coverImage: entry.cover,
        updatedAt: Date.now(),
        activeSeasonMalId: entry.id,
        anime: {
          overallStatus: watchStatus,
          seasons: {
            [entry.id]: {
              malId: entry.id,
              title: entry.title,
              type: resolveFormatType(entry.format),
              seasonNumber: 1,
              episodesWatched: entry.progress,
              totalEpisodes: entry.total ?? 0,
              status: watchStatus,
              score: entry.user_score ?? undefined,
            },
          },
        },
      };
    } else {
      franchises[franchiseId] = {
        franchiseId,
        rootMalId: entry.id,
        title: entry.title,
        coverImage: entry.cover,
        updatedAt: Date.now(),
        manga: {
          [entry.id]: {
            malId: entry.id,
            title: entry.title,
            chaptersRead: entry.progress,
            totalChapters: entry.total,
            volumesRead: 0,
            totalVolumes: null,
            status: mapLegacyToReadStatus(entry.status),
            score: entry.user_score ?? undefined,
          },
        },
      };
    }
  }

  saveFranchiseEntries(franchises);
  window.localStorage.setItem("okami_migration_v2", "done");
}

// ─── JSON Export / Import ───

export function exportAllData(): string {
  const entries = loadEntries();
  const franchises = loadFranchiseEntries();
  return JSON.stringify(
    { version: 2, entries, franchises, exportedAt: new Date().toISOString() },
    null,
    2
  );
}

export function importAllData(json: string): {
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
} {
  const data = JSON.parse(json);

  // New versioned format
  if (data && typeof data === "object" && data.version === 2) {
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      franchises:
        typeof data.franchises === "object" && data.franchises !== null ? data.franchises : {},
    };
  }

  // Old format — plain array of entries
  if (Array.isArray(data)) {
    return { entries: data, franchises: {} };
  }

  // Old format with entries key
  if (data && Array.isArray(data.entries)) {
    return { entries: data.entries, franchises: {} };
  }

  throw new Error("Invalid backup format");
}

// ─── Franchise Display Helper ───
// Converts a UnifiedFranchiseEntry to a display-friendly summary

export interface FranchiseDisplayInfo {
  franchiseId: string;
  rootMalId: number;
  title: string;
  coverImage: string;
  mediaType: "anime" | "manga" | "both";
  progressLabel: string; // e.g. "S2 • Ep 4/12" or "Vol 5 • Ch 42"
  overallStatus: OkamiStatus;
  totalSeasons: number;
  activeSeasonNumber: number;
  updatedAt: number;
}

export function getFranchiseDisplayInfo(
  franchise: UnifiedFranchiseEntry
): FranchiseDisplayInfo {
  const hasAnime = Boolean(franchise.anime && Object.keys(franchise.anime.seasons).length > 0);
  const hasManga = Boolean(franchise.manga && Object.keys(franchise.manga).length > 0);

  let progressLabel = "";
  let overallStatus: OkamiStatus = "plan_to_watch";
  let totalSeasons = 0;
  let activeSeasonNumber = 0;

  if (hasAnime && franchise.anime) {
    const seasons = Object.values(franchise.anime.seasons);
    totalSeasons = seasons.length;
    overallStatus = mapWatchStatusToLegacy(franchise.anime.overallStatus);

    const activeSeason = franchise.activeSeasonMalId
      ? franchise.anime.seasons[franchise.activeSeasonMalId]
      : seasons[0];

    if (activeSeason) {
      activeSeasonNumber = activeSeason.seasonNumber;
      const totalLabel = activeSeason.totalEpisodes > 0 ? String(activeSeason.totalEpisodes) : "?";
      progressLabel =
        totalSeasons > 1
          ? `S${activeSeason.seasonNumber} • Ep ${activeSeason.episodesWatched}/${totalLabel}`
          : `Ep ${activeSeason.episodesWatched}/${totalLabel}`;
    }
  } else if (hasManga && franchise.manga) {
    const firstManga = Object.values(franchise.manga)[0];
    if (firstManga) {
      overallStatus = mapReadStatusToLegacy(firstManga.status);
      const chTotal =
        firstManga.totalChapters !== null && firstManga.totalChapters > 0
          ? String(firstManga.totalChapters)
          : "?";
      progressLabel = `Vol ${firstManga.volumesRead} • Ch ${firstManga.chaptersRead}/${chTotal}`;
    }
  }

  return {
    franchiseId: franchise.franchiseId,
    rootMalId: franchise.rootMalId,
    title: franchise.title,
    coverImage: franchise.coverImage,
    mediaType: hasAnime && hasManga ? "both" : hasAnime ? "anime" : "manga",
    progressLabel,
    overallStatus,
    totalSeasons,
    activeSeasonNumber,
    updatedAt: franchise.updatedAt,
  };
}
