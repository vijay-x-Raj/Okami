"use client";

import { useEffect, useState, useCallback } from "react";
import type { MediaType } from "./jikan";

// ─── Legacy Types (preserved for backward compatibility) ───

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

// ─── Mihon-Inspired Relational Track & Franchise Types ───

export type WatchStatus = "WATCHING" | "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLAN_TO_WATCH";
export type ReadStatus = "READING" | "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLAN_TO_READ";

export interface SeasonProgress {
  malId: number;
  title: string;
  titleEnglish?: string | null;
  coverImage: string;
  type: "TV" | "Movie" | "OVA" | "Special" | "ONA" | string;
  seasonNumber: number; // 1, 2, 3... for mainline; 0 for Movies/OVAs
  episodesWatched: number;
  totalEpisodes: number; // 0 if unknown/ongoing
  watchedEpisodeIds: number[]; // Specific episode numbers toggled
  status: WatchStatus;
  score: number; // 0-10
  notes?: string;
  airingStatus?: string;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

export interface SeasonTrack extends SeasonProgress {
  franchiseId: string;
}

export interface MangaProgress {
  malId: number;
  title: string;
  titleEnglish?: string | null;
  coverImage: string;
  format: "Manga" | "Light Novel" | "One-shot" | "Manhwa" | "Manhua" | string;
  chaptersRead: number;
  totalChapters: number; // 0 if unknown/ongoing
  volumesRead: number;
  totalVolumes: number; // 0 if unknown/ongoing
  readVolumeNumbers: number[]; // Specific volume numbers toggled
  status: ReadStatus;
  score: number; // 0-10
  notes?: string;
  publishingStatus?: string;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

export interface MangaTrack extends MangaProgress {
  franchiseId: string;
}

export interface HistoryEntry {
  id: string; // `${franchiseId}_${malId}_${number}_${timestamp}`
  franchiseId: string;
  malId: number;
  mediaType: "anime" | "manga";
  number: number;
  title: string;
  coverImage?: string;
  timestamp: number;
}

export interface CustomCategory {
  id: string;
  name: string;
  order: number;
}

export interface UnifiedFranchiseEntry {
  franchiseId: string; // "franchise_{rootMalId}"
  rootMalId: number;
  title: string;
  titleEnglish?: string | null;
  coverImage: string;
  bannerImage?: string;
  genres: string[];
  addedAt: number;
  updatedAt: number;
  isFavorite: boolean;
  categories?: string[]; // Custom category IDs assigned to this franchise
  startedAt?: number;
  completedAt?: number;
  // Map any child mal_id (e.g. Season 2, Season 3, Manga ID) to this entry
  linkedMalIds: number[];
  anime?: {
    overallStatus: WatchStatus;
    activeSeasonMalId: number;
    seasons: Record<number, SeasonProgress | SeasonTrack>;
  };
  manga?: {
    overallStatus: ReadStatus;
    activeMangaMalId: number;
    series: Record<number, MangaProgress | MangaTrack>;
  };
}

// ─── Storage Keys & Constants ───

const STORAGE_KEY_LEGACY = "okami_entries";
const STORAGE_KEY_FRANCHISES = "okami_franchises";
const STORAGE_KEY_STORE_V2 = "okami_v2_store";
const STORAGE_KEY_SEASON_TRACKS = "okami_season_tracks";
const STORAGE_KEY_MANGA_TRACKS = "okami_manga_tracks";
const STORAGE_KEY_HISTORY = "okami_history";
const STORAGE_KEY_CATEGORIES = "okami_categories";
const STORAGE_EVENT_NAME = "okami-storage-update";

function emitStorageUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT_NAME));
}

// ─── Mihon Relational Track Storage & TrackManager ───

export function loadSeasonTracks(): Record<string, SeasonTrack> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SEASON_TRACKS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSeasonTracks(tracks: Record<string, SeasonTrack>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_SEASON_TRACKS, JSON.stringify(tracks));
  emitStorageUpdate();
}

export function loadMangaTracks(): Record<string, MangaTrack> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MANGA_TRACKS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMangaTracks(tracks: Record<string, MangaTrack>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_MANGA_TRACKS, JSON.stringify(tracks));
  emitStorageUpdate();
}

export const TrackManager = {
  getSeasonTrack(franchiseId: string, seasonMalId: number): SeasonTrack | undefined {
    const tracks = loadSeasonTracks();
    const key = `${franchiseId}_${seasonMalId}`;
    if (tracks[key]) return tracks[key];
    const franchises = loadFranchiseEntries();
    return franchises[franchiseId]?.anime?.seasons[seasonMalId] as SeasonTrack | undefined;
  },

  getMangaTrack(franchiseId: string, mangaMalId: number): MangaTrack | undefined {
    const tracks = loadMangaTracks();
    const key = `${franchiseId}_${mangaMalId}`;
    if (tracks[key]) return tracks[key];
    const franchises = loadFranchiseEntries();
    return franchises[franchiseId]?.manga?.series[mangaMalId] as MangaTrack | undefined;
  },

  getAllSeasonTracks(franchiseId?: string): SeasonTrack[] {
    const tracks = Object.values(loadSeasonTracks());
    if (franchiseId) return tracks.filter((t) => t.franchiseId === franchiseId);
    return tracks;
  },

  getAllMangaTracks(franchiseId?: string): MangaTrack[] {
    const tracks = Object.values(loadMangaTracks());
    if (franchiseId) return tracks.filter((t) => t.franchiseId === franchiseId);
    return tracks;
  },

  upsertSeasonTrack(track: SeasonTrack): void {
    const tracks = loadSeasonTracks();
    const key = `${track.franchiseId}_${track.malId}`;
    tracks[key] = { ...track, updatedAt: Date.now() };
    saveSeasonTracks(tracks);
  },

  upsertMangaTrack(track: MangaTrack): void {
    const tracks = loadMangaTracks();
    const key = `${track.franchiseId}_${track.malId}`;
    tracks[key] = { ...track, updatedAt: Date.now() };
    saveMangaTracks(tracks);
  },

  calculateStats(franchises: Record<string, UnifiedFranchiseEntry>) {
    let totalEpisodes = 0;
    let totalChapters = 0;
    let totalVolumes = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let completedAnime = 0;
    let completedManga = 0;

    for (const franchise of Object.values(franchises)) {
      if (franchise.anime?.seasons) {
        for (const season of Object.values(franchise.anime.seasons)) {
          totalEpisodes += season.episodesWatched || 0;
          if (season.score && season.score > 0) {
            scoreSum += season.score;
            scoreCount++;
          }
          if (season.status === "COMPLETED") {
            completedAnime++;
          }
        }
      }
      if (franchise.manga?.series) {
        for (const series of Object.values(franchise.manga.series)) {
          totalChapters += series.chaptersRead || 0;
          totalVolumes += series.volumesRead || 0;
          if (series.score && series.score > 0) {
            scoreSum += series.score;
            scoreCount++;
          }
          if (series.status === "COMPLETED") {
            completedManga++;
          }
        }
      }
    }

    const daysWatched = parseFloat((totalEpisodes / 60).toFixed(1));
    const meanScore = scoreCount > 0 ? parseFloat((scoreSum / scoreCount).toFixed(2)) : 0;

    return {
      totalEpisodes,
      totalChapters,
      totalVolumes,
      meanScore,
      daysWatched,
      completedAnime,
      completedManga,
    };
  },
};

// ─── Mihon Append-Only History Log ───

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(
  entry: Omit<HistoryEntry, "id" | "timestamp"> & { timestamp?: number }
): void {
  if (typeof window === "undefined") return;
  const history = loadHistory();
  const timestamp = entry.timestamp || Date.now();
  const id = `${entry.franchiseId}_${entry.malId}_${entry.number}_${timestamp}`;

  if (
    history.length > 0 &&
    history[0].franchiseId === entry.franchiseId &&
    history[0].malId === entry.malId &&
    history[0].number === entry.number
  ) {
    history[0].timestamp = timestamp;
    window.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    emitStorageUpdate();
    return;
  }

  const newHistory: HistoryEntry[] = [
    { ...entry, id, timestamp },
    ...history,
  ].slice(0, 200);

  window.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
  emitStorageUpdate();
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY_HISTORY);
  emitStorageUpdate();
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ─── Custom Categories Manager ───

export const DEFAULT_CATEGORIES: CustomCategory[] = [
  { id: "all", name: "All", order: 0 },
  { id: "bingeing", name: "Currently Bingeing", order: 1 },
  { id: "classics", name: "Masterpieces", order: 2 },
  { id: "seasonal", name: "Seasonal 2026", order: 3 },
];

export function loadCustomCategories(): CustomCategory[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (!raw) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as CustomCategory[]) : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCustomCategories(categories: CustomCategory[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  emitStorageUpdate();
}

export function addCustomCategory(name: string): CustomCategory {
  const categories = loadCustomCategories();
  const cleanName = name.trim();
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = categories.find((c) => c.id === id);
  if (existing) return existing;

  const newCat: CustomCategory = {
    id,
    name: cleanName,
    order: categories.length,
  };
  saveCustomCategories([...categories, newCat]);
  return newCat;
}

export function removeCustomCategory(id: string): void {
  const categories = loadCustomCategories();
  saveCustomCategories(categories.filter((c) => c.id !== id));
}

export function assignFranchiseCategory(franchiseId: string, categoryId: string): void {
  const franchises = loadFranchiseEntries();
  const franchise = franchises[franchiseId];
  if (!franchise) return;

  const cats = new Set(franchise.categories || []);
  cats.add(categoryId);
  franchises[franchiseId] = {
    ...franchise,
    categories: Array.from(cats),
    updatedAt: Date.now(),
  };
  saveFranchiseEntries(franchises);
}

export function unassignFranchiseCategory(franchiseId: string, categoryId: string): void {
  const franchises = loadFranchiseEntries();
  const franchise = franchises[franchiseId];
  if (!franchise || !franchise.categories) return;

  franchises[franchiseId] = {
    ...franchise,
    categories: franchise.categories.filter((c) => c !== categoryId),
    updatedAt: Date.now(),
  };
  saveFranchiseEntries(franchises);
}

// ─── Status Mapping ───

export function mapLegacyToWatchStatus(status: OkamiStatus): WatchStatus {
  const map: Record<OkamiStatus, WatchStatus> = {
    watching: "WATCHING",
    completed: "COMPLETED",
    on_hold: "ON_HOLD",
    dropped: "DROPPED",
    plan_to_watch: "PLAN_TO_WATCH",
  };
  return map[status] ?? "PLAN_TO_WATCH";
}

export function mapLegacyToReadStatus(status: OkamiStatus): ReadStatus {
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

// ─── Franchise Storage Operations ───

export function loadFranchiseEntries(): Record<string, UnifiedFranchiseEntry> {
  if (typeof window === "undefined") return {};
  try {
    // Check v2 store first, then fallback to okami_franchises
    const rawV2 = window.localStorage.getItem(STORAGE_KEY_STORE_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, UnifiedFranchiseEntry>;
      }
    }

    const raw = window.localStorage.getItem(STORAGE_KEY_FRANCHISES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFranchiseEntries(entries: Record<string, UnifiedFranchiseEntry>): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(entries);
  window.localStorage.setItem(STORAGE_KEY_FRANCHISES, serialized);
  window.localStorage.setItem(STORAGE_KEY_STORE_V2, serialized);
  emitStorageUpdate();
}

export function getFranchiseEntry(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string
): UnifiedFranchiseEntry | undefined {
  return entries[franchiseId];
}

/** Looks up franchise by any child mal_id (rootMalId, linkedMalIds, season malId, manga malId) */
export function findFranchiseByMalId(
  entries: Record<string, UnifiedFranchiseEntry>,
  malId: number
): UnifiedFranchiseEntry | undefined {
  if (!Number.isFinite(malId) || malId <= 0) return undefined;
  return Object.values(entries).find((f) => {
    if (f.rootMalId === malId) return true;
    if (Array.isArray(f.linkedMalIds) && f.linkedMalIds.includes(malId)) return true;
    if (f.anime?.seasons) {
      if (malId in f.anime.seasons || Object.values(f.anime.seasons).some((s) => s.malId === malId)) {
        return true;
      }
    }
    if (f.manga?.series) {
      if (malId in f.manga.series || Object.values(f.manga.series).some((s) => s.malId === malId)) {
        return true;
      }
    }
    return false;
  });
}

export function getFranchiseByMalId(
  entries: Record<string, UnifiedFranchiseEntry>,
  malId: number
): UnifiedFranchiseEntry | undefined {
  return findFranchiseByMalId(entries, malId);
}

export function upsertFranchiseEntry(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchise: UnifiedFranchiseEntry
): Record<string, UnifiedFranchiseEntry> {
  const updated = {
    ...entries,
    [franchise.franchiseId]: {
      ...franchise,
      updatedAt: Date.now(),
    },
  };
  saveFranchiseEntries(updated);
  return updated;
}

export function removeFranchiseEntry(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string
): Record<string, UnifiedFranchiseEntry> {
  const next = { ...entries };
  delete next[franchiseId];
  saveFranchiseEntries(next);
  return next;
}

// ─── Multi-Select Franchise Bundler (Mihon-Style Unified Entry) ───

export interface FranchiseItemOption {
  id: number;
  title: string;
  type: MediaType;
  format: string;
  seasonNumber?: number;
  total: number | null;
  cover: string;
  relation?: string;
  isCurrent?: boolean;
}

export function bundleFranchiseEntries(
  franchises: Record<string, UnifiedFranchiseEntry>,
  primaryItem: FranchiseItemOption,
  selectedItems: FranchiseItemOption[],
  primaryProgress: number,
  primaryStatus: OkamiStatus,
  userScore: number | null,
  notes: string
): { updatedFranchises: Record<string, UnifiedFranchiseEntry>; franchiseId: string } {
  const allIds = Array.from(new Set([primaryItem.id, ...selectedItems.map((i) => i.id)]));

  // Check if any of the items already belong to an existing franchise
  let existingFranchise: UnifiedFranchiseEntry | undefined;
  for (const id of allIds) {
    const found = findFranchiseByMalId(franchises, id);
    if (found) {
      existingFranchise = found;
      break;
    }
  }

  const rootMalId = existingFranchise?.rootMalId || primaryItem.id;
  const franchiseId = existingFranchise?.franchiseId || `franchise_${rootMalId}`;
  const now = Date.now();

  const mergedLinkedIds = Array.from(
    new Set([...(existingFranchise?.linkedMalIds || []), ...allIds])
  );

  const animeItems = [primaryItem, ...selectedItems].filter(
    (item, index, self) => item.type === "anime" && self.findIndex((s) => s.id === item.id) === index
  );
  const mangaItems = [primaryItem, ...selectedItems].filter(
    (item, index, self) => item.type === "manga" && self.findIndex((s) => s.id === item.id) === index
  );

  // Construct or update anime seasons
  const updatedSeasons: Record<number, SeasonProgress | SeasonTrack> = {
    ...(existingFranchise?.anime?.seasons || {}),
  };

  for (const item of animeItems) {
    const isPrimary = item.id === primaryItem.id;
    const existingSeason = updatedSeasons[item.id];
    const totalEps = item.total && item.total > 0 ? item.total : (existingSeason?.totalEpisodes || 0);

    if (isPrimary) {
      const watched = primaryProgress;
      const watchedIds = Array.from({ length: watched }, (_, i) => i + 1);
      const isDone = totalEps > 0 && watched >= totalEps;
      const watchStat: WatchStatus =
        primaryStatus === "completed" || isDone
          ? "COMPLETED"
          : watched > 0 || primaryStatus === "watching"
            ? "WATCHING"
            : primaryStatus === "on_hold"
              ? "ON_HOLD"
              : primaryStatus === "dropped"
                ? "DROPPED"
                : "PLAN_TO_WATCH";

      updatedSeasons[item.id] = {
        malId: item.id,
        title: item.title,
        coverImage: item.cover,
        type: item.format || "TV",
        seasonNumber: item.seasonNumber || 1,
        episodesWatched: watched,
        totalEpisodes: totalEps,
        watchedEpisodeIds: watchedIds,
        status: watchStat,
        score: userScore ?? 0,
        notes: notes || "",
        updatedAt: now,
      };
    } else if (!existingSeason) {
      updatedSeasons[item.id] = {
        malId: item.id,
        title: item.title,
        coverImage: item.cover,
        type: item.format || "TV",
        seasonNumber: item.seasonNumber || 1,
        episodesWatched: 0,
        totalEpisodes: totalEps,
        watchedEpisodeIds: [],
        status: "PLAN_TO_WATCH",
        score: 0,
        notes: "",
        updatedAt: now,
      };
    }
  }

  // Construct or update manga series
  const updatedSeries: Record<number, MangaProgress | MangaTrack> = {
    ...(existingFranchise?.manga?.series || {}),
  };

  for (const item of mangaItems) {
    const isPrimary = item.id === primaryItem.id;
    const existingManga = updatedSeries[item.id];
    const totalCh = item.total && item.total > 0 ? item.total : (existingManga?.totalChapters || 0);

    if (isPrimary) {
      const read = primaryProgress;
      const isDone = totalCh > 0 && read >= totalCh;
      const readStat: ReadStatus =
        primaryStatus === "completed" || isDone
          ? "COMPLETED"
          : read > 0 || primaryStatus === "watching"
            ? "READING"
            : primaryStatus === "on_hold"
              ? "ON_HOLD"
              : primaryStatus === "dropped"
                ? "DROPPED"
                : "PLAN_TO_READ";

      updatedSeries[item.id] = {
        malId: item.id,
        title: item.title,
        coverImage: item.cover,
        format: item.format || "Manga",
        chaptersRead: read,
        totalChapters: totalCh,
        volumesRead: existingManga?.volumesRead || 0,
        totalVolumes: existingManga?.totalVolumes || 0,
        readVolumeNumbers: existingManga?.readVolumeNumbers || [],
        status: readStat,
        score: userScore ?? 0,
        notes: notes || "",
        updatedAt: now,
      };
    } else if (!existingManga) {
      updatedSeries[item.id] = {
        malId: item.id,
        title: item.title,
        coverImage: item.cover,
        format: item.format || "Manga",
        chaptersRead: 0,
        totalChapters: totalCh,
        volumesRead: 0,
        totalVolumes: 0,
        readVolumeNumbers: [],
        status: "PLAN_TO_READ",
        score: 0,
        notes: "",
        updatedAt: now,
      };
    }
  }

  const hasAnime = Object.keys(updatedSeasons).length > 0;
  const hasManga = Object.keys(updatedSeries).length > 0;

  const allAnimeCompleted = hasAnime && Object.values(updatedSeasons).every((s) => s.status === "COMPLETED");
  const anyAnimeWatching = hasAnime && Object.values(updatedSeasons).some((s) => s.status === "WATCHING");
  const overallWatchStatus: WatchStatus = allAnimeCompleted
    ? "COMPLETED"
    : anyAnimeWatching
      ? "WATCHING"
      : "PLAN_TO_WATCH";

  const allMangaCompleted = hasManga && Object.values(updatedSeries).every((m) => m.status === "COMPLETED");
  const anyMangaReading = hasManga && Object.values(updatedSeries).some((m) => m.status === "READING");
  const overallReadStatus: ReadStatus = allMangaCompleted
    ? "COMPLETED"
    : anyMangaReading
      ? "READING"
      : "PLAN_TO_READ";

  const nextFranchise: UnifiedFranchiseEntry = {
    franchiseId,
    rootMalId,
    title: existingFranchise?.title || primaryItem.title,
    coverImage: existingFranchise?.coverImage || primaryItem.cover,
    bannerImage: existingFranchise?.bannerImage,
    genres: existingFranchise?.genres || [],
    addedAt: existingFranchise?.addedAt || now,
    updatedAt: now,
    isFavorite: existingFranchise?.isFavorite || false,
    categories: existingFranchise?.categories || [],
    linkedMalIds: mergedLinkedIds,
    ...(hasAnime
      ? {
          anime: {
            overallStatus: overallWatchStatus,
            activeSeasonMalId: primaryItem.type === "anime" ? primaryItem.id : existingFranchise?.anime?.activeSeasonMalId || rootMalId,
            seasons: updatedSeasons,
          },
        }
      : {}),
    ...(hasManga
      ? {
          manga: {
            overallStatus: overallReadStatus,
            activeMangaMalId: primaryItem.type === "manga" ? primaryItem.id : existingFranchise?.manga?.activeMangaMalId || rootMalId,
            series: updatedSeries,
          },
        }
      : {}),
  };

  const updatedFranchises: Record<string, UnifiedFranchiseEntry> = {
    ...franchises,
    [franchiseId]: nextFranchise,
  };

  saveFranchiseEntries(updatedFranchises);
  return { updatedFranchises, franchiseId };
}

// ─── Smart Episode Progression & Auto-Rollup Logic ───

export function incrementEpisode(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  seasonMalId: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.anime?.seasons[seasonMalId]) return entries;

  const currentSeason = franchise.anime.seasons[seasonMalId];
  const maxEps = currentSeason.totalEpisodes > 0 ? currentSeason.totalEpisodes : Infinity;
  const newWatchedCount = Math.min(currentSeason.episodesWatched + 1, maxEps);

  const watchedSet = new Set(currentSeason.watchedEpisodeIds || []);
  watchedSet.add(newWatchedCount);

  const now = Date.now();
  let startedAt = currentSeason.startedAt;
  let completedAt = currentSeason.completedAt;

  // Mihon Auto-Transition: 0 -> 1 moves to WATCHING and records startedAt
  let newSeasonStatus: WatchStatus = currentSeason.status;
  if ((newSeasonStatus === "PLAN_TO_WATCH" || !startedAt) && newWatchedCount > 0) {
    newSeasonStatus = "WATCHING";
    startedAt = startedAt || now;
  }
  // Mihon Auto-Transition: reaching totalEpisodes marks COMPLETED and records completedAt
  if (currentSeason.totalEpisodes > 0 && newWatchedCount >= currentSeason.totalEpisodes) {
    newSeasonStatus = "COMPLETED";
    completedAt = completedAt || now;
  }

  const updatedSeason: SeasonTrack = {
    ...currentSeason,
    franchiseId,
    episodesWatched: newWatchedCount,
    watchedEpisodeIds: Array.from(watchedSet).sort((a, b) => a - b),
    status: newSeasonStatus,
    startedAt,
    completedAt,
    updatedAt: now,
  };

  const updatedSeasons: Record<number, SeasonProgress | SeasonTrack> = {
    ...franchise.anime.seasons,
    [seasonMalId]: updatedSeason,
  };

  // Auto-advance active season to next chronological season if current completed
  let activeSeasonMalId = franchise.anime.activeSeasonMalId || seasonMalId;
  if (newSeasonStatus === "COMPLETED" && activeSeasonMalId === seasonMalId) {
    const sortedSeasons = Object.values(updatedSeasons).sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
    const nextSeason = sortedSeasons.find(
      (s) => s.seasonNumber > currentSeason.seasonNumber && s.status !== "COMPLETED"
    );
    if (nextSeason) {
      activeSeasonMalId = nextSeason.malId;
      updatedSeasons[nextSeason.malId] = {
        ...updatedSeasons[nextSeason.malId],
        status: "WATCHING",
        startedAt: updatedSeasons[nextSeason.malId].startedAt || now,
        updatedAt: now,
      };
    }
  }

  // Roll up overall franchise watch status
  const allCompleted = Object.values(updatedSeasons).every((s) => s.status === "COMPLETED");
  const overallStatus: WatchStatus = allCompleted
    ? "COMPLETED"
    : franchise.anime.overallStatus === "PLAN_TO_WATCH"
      ? "WATCHING"
      : franchise.anime.overallStatus;

  const nextFranchises: Record<string, UnifiedFranchiseEntry> = {
    ...entries,
    [franchiseId]: {
      ...franchise,
      updatedAt: now,
      startedAt: franchise.startedAt || startedAt,
      completedAt: allCompleted ? now : franchise.completedAt,
      anime: {
        ...franchise.anime,
        activeSeasonMalId,
        overallStatus,
        seasons: updatedSeasons,
      },
    },
  };

  // Append history log
  appendHistory({
    franchiseId,
    malId: seasonMalId,
    mediaType: "anime",
    number: newWatchedCount,
    title: currentSeason.title,
    coverImage: currentSeason.coverImage,
  });

  TrackManager.upsertSeasonTrack(updatedSeason);
  saveFranchiseEntries(nextFranchises);
  return nextFranchises;
}

export function toggleEpisode(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  seasonMalId: number,
  episodeNumber: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.anime?.seasons[seasonMalId]) return entries;

  const currentSeason = franchise.anime.seasons[seasonMalId];
  const watchedSet = new Set(currentSeason.watchedEpisodeIds || []);
  const isAdding = !watchedSet.has(episodeNumber);

  if (isAdding) {
    watchedSet.add(episodeNumber);
  } else {
    watchedSet.delete(episodeNumber);
  }

  const watchedArray = Array.from(watchedSet).sort((a, b) => a - b);
  const episodesWatched = watchedArray.length;
  const now = Date.now();
  let startedAt = currentSeason.startedAt;
  let completedAt = currentSeason.completedAt;

  let newSeasonStatus: WatchStatus = currentSeason.status;
  if (currentSeason.totalEpisodes > 0 && episodesWatched >= currentSeason.totalEpisodes) {
    newSeasonStatus = "COMPLETED";
    completedAt = completedAt || now;
  } else if (episodesWatched > 0) {
    newSeasonStatus = "WATCHING";
    startedAt = startedAt || now;
  } else if (episodesWatched === 0 && currentSeason.status === "WATCHING") {
    newSeasonStatus = "PLAN_TO_WATCH";
  }

  const updatedSeason: SeasonTrack = {
    ...currentSeason,
    franchiseId,
    episodesWatched,
    watchedEpisodeIds: watchedArray,
    status: newSeasonStatus,
    startedAt,
    completedAt,
    updatedAt: now,
  };

  if (isAdding) {
    appendHistory({
      franchiseId,
      malId: seasonMalId,
      mediaType: "anime",
      number: episodeNumber,
      title: currentSeason.title,
      coverImage: currentSeason.coverImage,
    });
  }

  const updatedSeasons = {
    ...franchise.anime.seasons,
    [seasonMalId]: updatedSeason,
  };

  let activeSeasonMalId = franchise.anime.activeSeasonMalId || seasonMalId;
  if (newSeasonStatus === "COMPLETED" && activeSeasonMalId === seasonMalId) {
    const sortedSeasons = Object.values(updatedSeasons).sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
    const nextSeason = sortedSeasons.find(
      (s) => s.seasonNumber > currentSeason.seasonNumber && s.status !== "COMPLETED"
    );
    if (nextSeason) {
      activeSeasonMalId = nextSeason.malId;
      updatedSeasons[nextSeason.malId] = {
        ...updatedSeasons[nextSeason.malId],
        status: "WATCHING",
        updatedAt: Date.now(),
      };
    }
  }

  const allCompleted = Object.values(updatedSeasons).every((s) => s.status === "COMPLETED");
  const overallStatus: WatchStatus = allCompleted
    ? "COMPLETED"
    : franchise.anime.overallStatus === "PLAN_TO_WATCH" && episodesWatched > 0
      ? "WATCHING"
      : franchise.anime.overallStatus;

  const nextFranchises: Record<string, UnifiedFranchiseEntry> = {
    ...entries,
    [franchiseId]: {
      ...franchise,
      updatedAt: Date.now(),
      anime: {
        ...franchise.anime,
        activeSeasonMalId,
        overallStatus,
        seasons: updatedSeasons,
      },
    },
  };

  saveFranchiseEntries(nextFranchises);
  return nextFranchises;
}

export function bulkWatchEpisodes(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  seasonMalId: number,
  upToEpisode: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.anime?.seasons[seasonMalId]) return entries;

  const currentSeason = franchise.anime.seasons[seasonMalId];
  const watchedSet = new Set<number>();
  for (let i = 1; i <= upToEpisode; i++) {
    watchedSet.add(i);
  }

  const watchedArray = Array.from(watchedSet).sort((a, b) => a - b);
  const episodesWatched = watchedArray.length;

  const newSeasonStatus: WatchStatus =
    currentSeason.totalEpisodes > 0 && episodesWatched >= currentSeason.totalEpisodes
      ? "COMPLETED"
      : "WATCHING";

  const updatedSeason: SeasonProgress = {
    ...currentSeason,
    episodesWatched,
    watchedEpisodeIds: watchedArray,
    status: newSeasonStatus,
    updatedAt: Date.now(),
  };

  const updatedSeasons = {
    ...franchise.anime.seasons,
    [seasonMalId]: updatedSeason,
  };

  let activeSeasonMalId = franchise.anime.activeSeasonMalId || seasonMalId;
  if (newSeasonStatus === "COMPLETED" && activeSeasonMalId === seasonMalId) {
    const sortedSeasons = Object.values(updatedSeasons).sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
    const nextSeason = sortedSeasons.find(
      (s) => s.seasonNumber > currentSeason.seasonNumber && s.status !== "COMPLETED"
    );
    if (nextSeason) {
      activeSeasonMalId = nextSeason.malId;
      updatedSeasons[nextSeason.malId] = {
        ...updatedSeasons[nextSeason.malId],
        status: "WATCHING",
        updatedAt: Date.now(),
      };
    }
  }

  const allCompleted = Object.values(updatedSeasons).every((s) => s.status === "COMPLETED");
  const overallStatus: WatchStatus = allCompleted ? "COMPLETED" : "WATCHING";

  const nextFranchises: Record<string, UnifiedFranchiseEntry> = {
    ...entries,
    [franchiseId]: {
      ...franchise,
      updatedAt: Date.now(),
      anime: {
        ...franchise.anime,
        activeSeasonMalId,
        overallStatus,
        seasons: updatedSeasons,
      },
    },
  };

  saveFranchiseEntries(nextFranchises);
  return nextFranchises;
}

export function markSeasonCompleted(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  seasonMalId: number,
  knownTotalEpisodes?: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.anime?.seasons[seasonMalId]) return entries;

  const currentSeason = franchise.anime.seasons[seasonMalId];
  const total = currentSeason.totalEpisodes > 0 ? currentSeason.totalEpisodes : knownTotalEpisodes || 12;

  return bulkWatchEpisodes(entries, franchiseId, seasonMalId, total);
}

// ─── Smart Manga Progression & Auto-Rollup Logic ───

export function updateMangaProgress(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  mangaMalId: number,
  patch: Partial<MangaProgress>
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  if (!franchise?.manga?.series[mangaMalId]) return entries;

  const currentManga = franchise.manga.series[mangaMalId];
  const now = Date.now();
  let startedAt = currentManga.startedAt;
  let completedAt = currentManga.completedAt;

  const updatedManga: MangaTrack = {
    ...currentManga,
    franchiseId,
    ...patch,
    updatedAt: now,
  };

  // Mihon Auto-Transition: Start reading if it was planned and progress > 0
  if (
    (updatedManga.status === "PLAN_TO_READ" || !startedAt) &&
    (updatedManga.chaptersRead > 0 || updatedManga.volumesRead > 0)
  ) {
    updatedManga.status = "READING";
    startedAt = startedAt || now;
  }

  // Mihon Auto-Transition: Auto-complete when all chapters read
  if (
    updatedManga.totalChapters > 0 &&
    updatedManga.chaptersRead >= updatedManga.totalChapters
  ) {
    updatedManga.status = "COMPLETED";
    completedAt = completedAt || now;
  }

  updatedManga.startedAt = startedAt;
  updatedManga.completedAt = completedAt;

  if (patch.chaptersRead !== undefined || patch.volumesRead !== undefined) {
    appendHistory({
      franchiseId,
      malId: mangaMalId,
      mediaType: "manga",
      number: updatedManga.chaptersRead || updatedManga.volumesRead || 1,
      title: currentManga.title,
      coverImage: currentManga.coverImage,
    });
  }

  TrackManager.upsertMangaTrack(updatedManga);

  const updatedSeries: Record<number, MangaProgress | MangaTrack> = {
    ...franchise.manga.series,
    [mangaMalId]: updatedManga,
  };

  const allCompleted = Object.values(updatedSeries).every((m) => m.status === "COMPLETED");
  const overallStatus: ReadStatus = allCompleted
    ? "COMPLETED"
    : franchise.manga.overallStatus === "PLAN_TO_READ" && updatedManga.chaptersRead > 0
      ? "READING"
      : franchise.manga.overallStatus;

  const nextFranchises: Record<string, UnifiedFranchiseEntry> = {
    ...entries,
    [franchiseId]: {
      ...franchise,
      updatedAt: Date.now(),
      manga: {
        ...franchise.manga,
        overallStatus,
        series: updatedSeries,
      },
    },
  };

  saveFranchiseEntries(nextFranchises);
  return nextFranchises;
}

export function incrementChapter(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  mangaMalId: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  const manga = franchise?.manga?.series[mangaMalId];
  if (!manga) return entries;

  const maxCh = manga.totalChapters > 0 ? manga.totalChapters : Infinity;
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
  const manga = franchise?.manga?.series[mangaMalId];
  if (!manga) return entries;

  const maxVol = manga.totalVolumes > 0 ? manga.totalVolumes : Infinity;
  const newVol = Math.min(manga.volumesRead + 1, maxVol);
  const readSet = new Set(manga.readVolumeNumbers || []);
  readSet.add(newVol);

  return updateMangaProgress(entries, franchiseId, mangaMalId, {
    volumesRead: newVol,
    readVolumeNumbers: Array.from(readSet).sort((a, b) => a - b),
  });
}

export function toggleVolume(
  entries: Record<string, UnifiedFranchiseEntry>,
  franchiseId: string,
  mangaMalId: number,
  volumeNumber: number
): Record<string, UnifiedFranchiseEntry> {
  const franchise = entries[franchiseId];
  const manga = franchise?.manga?.series[mangaMalId];
  if (!manga) return entries;

  const readSet = new Set(manga.readVolumeNumbers || []);
  if (readSet.has(volumeNumber)) {
    readSet.delete(volumeNumber);
  } else {
    readSet.add(volumeNumber);
  }

  const readArray = Array.from(readSet).sort((a, b) => a - b);
  return updateMangaProgress(entries, franchiseId, mangaMalId, {
    volumesRead: readArray.length,
    readVolumeNumbers: readArray,
  });
}

// ─── Legacy Storage CRUD (with cross-sync to Unified) ───

export function loadEntries(): OkamiEntry[] {
  return readEntries();
}

export function readEntries(): OkamiEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LEGACY);
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
  window.localStorage.setItem(STORAGE_KEY_LEGACY, JSON.stringify(entries));
  emitStorageUpdate();
}

export function addEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  const exists = entries.some((existing) => existing.id === entry.id && existing.type === entry.type);
  if (exists) return entries;
  const next = [...entries, { ...entry, date_added: new Date().toISOString() }];
  saveEntries(next);
  return next;
}

export function upsertEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id && existing.type === entry.type);
  let next: OkamiEntry[];
  if (index === -1) {
    next = [entry, ...entries];
  } else {
    next = [...entries];
    next[index] = entry;
  }
  saveEntries(next);
  return next;
}

export function updateEntry(
  entries: OkamiEntry[],
  id: number,
  type: MediaType,
  patch: Partial<OkamiEntry>
): OkamiEntry[] {
  const next = entries.map((entry) =>
    entry.id === id && entry.type === type ? { ...entry, ...patch } : entry
  );
  saveEntries(next);
  return next;
}

export function removeEntry(entries: OkamiEntry[], id: number, type: MediaType): OkamiEntry[] {
  const next = entries.filter((entry) => !(entry.id === id && entry.type === type));
  saveEntries(next);
  return next;
}

export function toggleFavourite(entries: OkamiEntry[], id: number, type: MediaType): OkamiEntry[] {
  const next = entries.map((entry) =>
    entry.id === id && entry.type === type
      ? { ...entry, is_favourite: !entry.is_favourite }
      : entry
  );
  saveEntries(next);
  return next;
}

// ─── Non-Destructive Migration: Legacy → Unified Franchise ───

function resolveFormatType(format: string): "TV" | "Movie" | "OVA" | "Special" | "ONA" {
  const lower = format.toLowerCase();
  if (lower.includes("film") || lower.includes("movie")) return "Movie";
  if (lower.includes("ova")) return "OVA";
  if (lower.includes("ona")) return "ONA";
  if (lower.includes("special")) return "Special";
  return "TV";
}

export function migrateLegacyEntries(): void {
  if (typeof window === "undefined") return;

  const migratedKey = "okami_migration_v2_completed";
  if (window.localStorage.getItem(migratedKey) === "done") return;

  const legacy = loadEntries();
  if (legacy.length === 0) {
    window.localStorage.setItem(migratedKey, "done");
    return;
  }

  const franchises = loadFranchiseEntries();

  for (const entry of legacy) {
    const franchiseId = `franchise_${entry.id}`;
    if (franchises[franchiseId]) continue;

    const now = Date.now();
    if (entry.type === "anime") {
      const watchStatus = mapLegacyToWatchStatus(entry.status);
      const totalEps = entry.total ?? 0;
      const watchedCount = entry.progress || 0;
      const watchedIds =
        entry.completed_episodes && entry.completed_episodes.length > 0
          ? entry.completed_episodes
          : Array.from({ length: watchedCount }, (_, i) => i + 1);

      franchises[franchiseId] = {
        franchiseId,
        rootMalId: entry.id,
        title: entry.title,
        coverImage: entry.cover,
        genres: entry.genres || [],
        addedAt: new Date(entry.date_added || Date.now()).getTime(),
        updatedAt: now,
        isFavorite: Boolean(entry.is_favourite),
        linkedMalIds: [entry.id],
        anime: {
          overallStatus: watchStatus,
          activeSeasonMalId: entry.id,
          seasons: {
            [entry.id]: {
              malId: entry.id,
              title: entry.title,
              coverImage: entry.cover,
              type: resolveFormatType(entry.format),
              seasonNumber: 1,
              episodesWatched: watchedCount,
              totalEpisodes: totalEps,
              watchedEpisodeIds: watchedIds,
              status: watchStatus,
              score: entry.user_score ?? 0,
              notes: entry.notes || "",
              updatedAt: now,
            },
          },
        },
      };
    } else {
      const readStatus = mapLegacyToReadStatus(entry.status);
      const totalCh = entry.total ?? 0;
      const chRead = entry.progress || 0;
      const volsRead = entry.completed_volumes?.length || 0;

      franchises[franchiseId] = {
        franchiseId,
        rootMalId: entry.id,
        title: entry.title,
        coverImage: entry.cover,
        genres: entry.genres || [],
        addedAt: new Date(entry.date_added || Date.now()).getTime(),
        updatedAt: now,
        isFavorite: Boolean(entry.is_favourite),
        linkedMalIds: [entry.id],
        manga: {
          overallStatus: readStatus,
          activeMangaMalId: entry.id,
          series: {
            [entry.id]: {
              malId: entry.id,
              title: entry.title,
              coverImage: entry.cover,
              format: entry.format || "Manga",
              chaptersRead: chRead,
              totalChapters: totalCh,
              volumesRead: volsRead,
              totalVolumes: 0,
              readVolumeNumbers: entry.completed_volumes || [],
              status: readStatus,
              score: entry.user_score ?? 0,
              notes: entry.notes || "",
              updatedAt: now,
            },
          },
        },
      };
    }
  }

  saveFranchiseEntries(franchises);
  window.localStorage.setItem(migratedKey, "done");
}

// ─── Reactive React Hook (Cross-tab and In-Memory Synchronization) ───

export function useOkamiStore() {
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>({});
  const [entries, setEntries] = useState<OkamiEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(() => {
    migrateLegacyEntries();
    setFranchises(loadFranchiseEntries());
    setEntries(loadEntries());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => refresh());

    const handleUpdate = () => {
      setFranchises(loadFranchiseEntries());
      setEntries(loadEntries());
    };

    window.addEventListener(STORAGE_EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener(STORAGE_EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [refresh]);

  return {
    franchises,
    entries,
    isLoaded,
    refresh,
    saveFranchises: saveFranchiseEntries,
    saveEntries,
  };
}

// ─── Display Helper ───

export interface FranchiseDisplayInfo {
  franchiseId: string;
  rootMalId: number;
  title: string;
  coverImage: string;
  mediaType: "anime" | "manga" | "both";
  progressLabel: string; // e.g. "S2 • Ep 4/12" or "Vol 5 • Ch 42"
  overallStatus: OkamiStatus;
  watchStatus?: WatchStatus;
  readStatus?: ReadStatus;
  totalSeasons: number;
  activeSeasonNumber: number;
  activeSeasonMalId?: number;
  activeMangaMalId?: number;
  isFavorite: boolean;
  categories: string[];
  unwatchedCount: number;
  unreadCount: number;
  totalAvailable: number;
  totalProgress: number;
  updatedAt: number;
}

export function getFranchiseDisplayInfo(
  franchise: UnifiedFranchiseEntry
): FranchiseDisplayInfo {
  const animeSeasons = franchise.anime ? Object.values(franchise.anime.seasons) : [];
  const mangaSeries = franchise.manga ? Object.values(franchise.manga.series) : [];

  const hasAnime = animeSeasons.length > 0;
  const hasManga = mangaSeries.length > 0;

  let progressLabel = "";
  let overallStatus: OkamiStatus = "plan_to_watch";
  const totalSeasons = animeSeasons.length;
  let activeSeasonNumber = 1;
  let activeSeasonMalId = franchise.anime?.activeSeasonMalId;
  let activeMangaMalId = franchise.manga?.activeMangaMalId;

  let unwatchedCount = 0;
  let unreadCount = 0;
  let totalAvailable = 0;
  let totalProgress = 0;

  if (hasAnime && franchise.anime) {
    overallStatus = mapWatchStatusToLegacy(franchise.anime.overallStatus);
    const activeSeason = activeSeasonMalId
      ? franchise.anime.seasons[activeSeasonMalId]
      : animeSeasons[0];

    // Compute unwatched badge count across all franchise seasons
    for (const season of animeSeasons) {
      if (season.totalEpisodes > 0) {
        totalAvailable += season.totalEpisodes;
        const diff = Math.max(0, season.totalEpisodes - season.episodesWatched);
        unwatchedCount += diff;
      }
      totalProgress += season.episodesWatched || 0;
    }

    if (activeSeason) {
      activeSeasonNumber = activeSeason.seasonNumber;
      activeSeasonMalId = activeSeason.malId;
      const totalLabel = activeSeason.totalEpisodes > 0 ? String(activeSeason.totalEpisodes) : "∞";
      progressLabel =
        totalSeasons > 1
          ? `S${activeSeason.seasonNumber} • Ep ${activeSeason.episodesWatched}/${totalLabel}`
          : `Ep ${activeSeason.episodesWatched}/${totalLabel}`;
    }
  } else if (hasManga && franchise.manga) {
    const activeManga = activeMangaMalId
      ? franchise.manga.series[activeMangaMalId]
      : mangaSeries[0];

    for (const series of mangaSeries) {
      if (series.totalChapters > 0) {
        totalAvailable += series.totalChapters;
        const diff = Math.max(0, series.totalChapters - series.chaptersRead);
        unreadCount += diff;
      }
      totalProgress += series.chaptersRead || 0;
    }

    if (activeManga) {
      activeMangaMalId = activeManga.malId;
      overallStatus = mapReadStatusToLegacy(activeManga.status);
      const chTotal = activeManga.totalChapters > 0 ? String(activeManga.totalChapters) : "∞";
      progressLabel = `Vol ${activeManga.volumesRead} • Ch ${activeManga.chaptersRead}/${chTotal}`;
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
    watchStatus: franchise.anime?.overallStatus,
    readStatus: franchise.manga?.overallStatus,
    totalSeasons,
    activeSeasonNumber,
    activeSeasonMalId,
    activeMangaMalId,
    isFavorite: Boolean(franchise.isFavorite),
    categories: Array.isArray(franchise.categories) ? franchise.categories : [],
    unwatchedCount,
    unreadCount,
    totalAvailable,
    totalProgress,
    updatedAt: franchise.updatedAt,
  };
}

// ─── Mihon-Inspired Versioned Backup Export / Restore & MAL/AniList Importers ───

export function exportLibraryAsJson(): string {
  const entries = loadEntries();
  const franchises = loadFranchiseEntries();
  const seasonTracks = loadSeasonTracks();
  const mangaTracks = loadMangaTracks();
  const history = loadHistory();
  const categories = loadCustomCategories();

  return JSON.stringify(
    {
      version: 3,
      exportedAt: new Date().toISOString(),
      franchises,
      seasonTracks,
      mangaTracks,
      categories,
      history,
      entries,
    },
    null,
    2
  );
}

export function importLibraryFromJson(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== "object") return false;

    if (data.version === 3) {
      if (data.franchises && typeof data.franchises === "object") {
        saveFranchiseEntries(data.franchises);
      }
      if (data.seasonTracks && typeof data.seasonTracks === "object") {
        saveSeasonTracks(data.seasonTracks);
      }
      if (data.mangaTracks && typeof data.mangaTracks === "object") {
        saveMangaTracks(data.mangaTracks);
      }
      if (Array.isArray(data.categories)) {
        saveCustomCategories(data.categories);
      }
      if (Array.isArray(data.history)) {
        window.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(data.history));
      }
      if (Array.isArray(data.entries)) {
        saveEntries(data.entries);
      }
      emitStorageUpdate();
      return true;
    }

    if (data.version === 2 && data.franchises && typeof data.franchises === "object") {
      saveFranchiseEntries(data.franchises);
      if (Array.isArray(data.entries)) {
        saveEntries(data.entries);
      }
      return true;
    }

    if (Array.isArray(data)) {
      saveEntries(data as OkamiEntry[]);
      migrateLegacyEntries();
      return true;
    }

    if (Array.isArray(data.entries)) {
      saveEntries(data.entries as OkamiEntry[]);
      migrateLegacyEntries();
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function importFromMAL(content: string): { importedCount: number; errors: string[] } {
  const errors: string[] = [];
  let importedCount = 0;
  const franchises = loadFranchiseEntries();

  try {
    const isXml = content.trim().startsWith("<") || content.includes("<myanimelist>");

    if (isXml) {
      const animeMatches = content.matchAll(/<anime>([\s\S]*?)<\/anime>/g);
      for (const match of animeMatches) {
        try {
          const block = match[1];
          const idMatch = block.match(/<series_animedb_id>(\d+)<\/series_animedb_id>/);
          const titleMatch =
            block.match(/<series_title><!\[CDATA\[(.*?)\]\]><\/series_title>/) ||
            block.match(/<series_title>(.*?)<\/series_title>/);
          const epsWatchedMatch = block.match(/<my_watched_episodes>(\d+)<\/my_watched_episodes>/);
          const scoreMatch = block.match(/<my_score>(\d+)<\/my_score>/);
          const statusMatch = block.match(/<my_status>(.*?)<\/my_status>/);

          if (!idMatch) continue;
          const malId = parseInt(idMatch[1], 10);
          const title = titleMatch ? titleMatch[1].trim() : `Anime #${malId}`;
          const episodesWatched = epsWatchedMatch ? parseInt(epsWatchedMatch[1], 10) : 0;
          const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
          const statusStr = statusMatch ? statusMatch[1].toLowerCase().replace(/\s+/g, "_") : "plan_to_watch";

          let watchStatus: WatchStatus = "PLAN_TO_WATCH";
          if (statusStr.includes("watch") && !statusStr.includes("plan")) watchStatus = "WATCHING";
          else if (statusStr.includes("comp")) watchStatus = "COMPLETED";
          else if (statusStr.includes("hold")) watchStatus = "ON_HOLD";
          else if (statusStr.includes("drop")) watchStatus = "DROPPED";

          const franchiseId = `franchise_${malId}`;
          const existing = franchises[franchiseId];
          const now = Date.now();

          franchises[franchiseId] = {
            franchiseId,
            rootMalId: malId,
            title: existing?.title || title,
            coverImage: existing?.coverImage || "",
            genres: existing?.genres || [],
            addedAt: existing?.addedAt || now,
            updatedAt: now,
            isFavorite: existing?.isFavorite || false,
            linkedMalIds: existing?.linkedMalIds || [malId],
            anime: {
              overallStatus: watchStatus,
              activeSeasonMalId: malId,
              seasons: {
                [malId]: {
                  malId,
                  title,
                  coverImage: existing?.coverImage || "",
                  type: "TV",
                  seasonNumber: 1,
                  episodesWatched,
                  totalEpisodes: 0,
                  watchedEpisodeIds: Array.from({ length: episodesWatched }, (_, i) => i + 1),
                  status: watchStatus,
                  score,
                  startedAt: episodesWatched > 0 ? now : undefined,
                  completedAt: watchStatus === "COMPLETED" ? now : undefined,
                  updatedAt: now,
                },
              },
            },
          };
          importedCount++;
        } catch (e) {
          errors.push(String(e));
        }
      }

      const mangaMatches = content.matchAll(/<manga>([\s\S]*?)<\/manga>/g);
      for (const match of mangaMatches) {
        try {
          const block = match[1];
          const idMatch = block.match(/<manga_mangadb_id>(\d+)<\/manga_mangadb_id>/);
          const titleMatch =
            block.match(/<manga_title><!\[CDATA\[(.*?)\]\]><\/manga_title>/) ||
            block.match(/<manga_title>(.*?)<\/manga_title>/);
          const chMatch = block.match(/<my_read_chapters>(\d+)<\/my_read_chapters>/);
          const volMatch = block.match(/<my_read_volumes>(\d+)<\/my_read_volumes>/);
          const scoreMatch = block.match(/<my_score>(\d+)<\/my_score>/);
          const statusMatch = block.match(/<my_status>(.*?)<\/my_status>/);

          if (!idMatch) continue;
          const malId = parseInt(idMatch[1], 10);
          const title = titleMatch ? titleMatch[1].trim() : `Manga #${malId}`;
          const chaptersRead = chMatch ? parseInt(chMatch[1], 10) : 0;
          const volumesRead = volMatch ? parseInt(volMatch[1], 10) : 0;
          const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
          const statusStr = statusMatch ? statusMatch[1].toLowerCase().replace(/\s+/g, "_") : "plan_to_read";

          let readStatus: ReadStatus = "PLAN_TO_READ";
          if (statusStr.includes("read") && !statusStr.includes("plan")) readStatus = "READING";
          else if (statusStr.includes("comp")) readStatus = "COMPLETED";
          else if (statusStr.includes("hold")) readStatus = "ON_HOLD";
          else if (statusStr.includes("drop")) readStatus = "DROPPED";

          const franchiseId = `franchise_${malId}`;
          const existing = franchises[franchiseId];
          const now = Date.now();

          franchises[franchiseId] = {
            ...(existing || {
              franchiseId,
              rootMalId: malId,
              title,
              coverImage: "",
              genres: [],
              addedAt: now,
              isFavorite: false,
              linkedMalIds: [malId],
            }),
            updatedAt: now,
            manga: {
              overallStatus: readStatus,
              activeMangaMalId: malId,
              series: {
                [malId]: {
                  malId,
                  title,
                  coverImage: existing?.coverImage || "",
                  format: "Manga",
                  chaptersRead,
                  totalChapters: 0,
                  volumesRead,
                  totalVolumes: 0,
                  readVolumeNumbers: Array.from({ length: volumesRead }, (_, i) => i + 1),
                  status: readStatus,
                  score,
                  startedAt: chaptersRead > 0 ? now : undefined,
                  completedAt: readStatus === "COMPLETED" ? now : undefined,
                  updatedAt: now,
                },
              },
            },
          };
          importedCount++;
        } catch (e) {
          errors.push(String(e));
        }
      }
    } else {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : data.anime || data.entries || [];
      for (const item of items) {
        const malId = item.mal_id || item.id || item.series_animedb_id;
        if (!malId) continue;
        const franchiseId = `franchise_${malId}`;
        const title = item.title || item.series_title || `Media #${malId}`;
        const eps = item.episodesWatched || item.watched_episodes || item.progress || 0;
        const now = Date.now();
        franchises[franchiseId] = {
          franchiseId,
          rootMalId: malId,
          title,
          coverImage: item.cover || item.coverImage || "",
          genres: item.genres || [],
          addedAt: now,
          updatedAt: now,
          isFavorite: Boolean(item.isFavorite),
          linkedMalIds: [malId],
          anime: {
            overallStatus: "WATCHING",
            activeSeasonMalId: malId,
            seasons: {
              [malId]: {
                malId,
                title,
                coverImage: item.cover || item.coverImage || "",
                type: "TV",
                seasonNumber: 1,
                episodesWatched: eps,
                totalEpisodes: item.totalEpisodes || item.total || 0,
                watchedEpisodeIds: Array.from({ length: eps }, (_, i) => i + 1),
                status: "WATCHING",
                score: item.score || 0,
                updatedAt: now,
              },
            },
          },
        };
        importedCount++;
      }
    }

    if (importedCount > 0) {
      saveFranchiseEntries(franchises);
    }
  } catch (err) {
    errors.push(String(err));
  }

  return { importedCount, errors };
}

export function importFromAniList(content: string): { importedCount: number; errors: string[] } {
  const errors: string[] = [];
  let importedCount = 0;
  const franchises = loadFranchiseEntries();

  try {
    const data = JSON.parse(content);
    const lists = Array.isArray(data.lists) ? data.lists : Array.isArray(data) ? [{ entries: data }] : [];

    for (const list of lists) {
      const entries = Array.isArray(list.entries) ? list.entries : [];
      for (const entry of entries) {
        try {
          const malId = entry.media?.idMal || entry.mediaId || entry.id;
          if (!malId) continue;

          const title =
            entry.media?.title?.romaji || entry.media?.title?.english || entry.title || `Media #${malId}`;
          const cover = entry.media?.coverImage?.large || entry.media?.coverImage?.medium || entry.cover || "";
          const eps = entry.progress || 0;
          const totalEps = entry.media?.episodes || 0;
          const score =
            typeof entry.score === "number"
              ? Math.round(entry.score > 10 ? entry.score / 10 : entry.score)
              : 0;
          const statusRaw = String(entry.status || list.name || "").toUpperCase();

          let status: WatchStatus = "PLAN_TO_WATCH";
          if (statusRaw.includes("CURRENT") || statusRaw.includes("WATCH")) status = "WATCHING";
          else if (statusRaw.includes("COMPLETED")) status = "COMPLETED";
          else if (statusRaw.includes("PAUSED") || statusRaw.includes("HOLD")) status = "ON_HOLD";
          else if (statusRaw.includes("DROPPED")) status = "DROPPED";

          const franchiseId = `franchise_${malId}`;
          const now = Date.now();

          franchises[franchiseId] = {
            franchiseId,
            rootMalId: malId,
            title,
            coverImage: cover,
            genres: entry.media?.genres || [],
            addedAt: now,
            updatedAt: now,
            isFavorite: Boolean(entry.isFavorite),
            linkedMalIds: [malId],
            anime: {
              overallStatus: status,
              activeSeasonMalId: malId,
              seasons: {
                [malId]: {
                  malId,
                  title,
                  coverImage: cover,
                  type: "TV",
                  seasonNumber: 1,
                  episodesWatched: eps,
                  totalEpisodes: totalEps,
                  watchedEpisodeIds: Array.from({ length: eps }, (_, i) => i + 1),
                  status,
                  score,
                  startedAt: eps > 0 ? now : undefined,
                  completedAt: status === "COMPLETED" ? now : undefined,
                  updatedAt: now,
                },
              },
            },
          };
          importedCount++;
        } catch (e) {
          errors.push(String(e));
        }
      }
    }

    if (importedCount > 0) {
      saveFranchiseEntries(franchises);
    }
  } catch (err) {
    errors.push(String(err));
  }

  return { importedCount, errors };
}

/** Legacy aliases */
export const exportAllData = exportLibraryAsJson;
export function importAllData(json: string): {
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
} {
  const success = importLibraryFromJson(json);
  if (!success) throw new Error("Invalid backup format");
  return {
    entries: loadEntries(),
    franchises: loadFranchiseEntries(),
  };
}
