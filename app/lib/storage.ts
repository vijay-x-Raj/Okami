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

// ─── Unified Franchise Types (v2) ───

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
  updatedAt: number;
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
  updatedAt: number;
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
  // Map any child mal_id (e.g. Season 2, Season 3, Manga ID) to this entry
  linkedMalIds: number[];
  anime?: {
    overallStatus: WatchStatus;
    activeSeasonMalId: number;
    seasons: Record<number, SeasonProgress>;
  };
  manga?: {
    overallStatus: ReadStatus;
    activeMangaMalId: number;
    series: Record<number, MangaProgress>;
  };
}

// ─── Storage Keys & Constants ───

const STORAGE_KEY_LEGACY = "okami_entries";
const STORAGE_KEY_FRANCHISES = "okami_franchises";
const STORAGE_KEY_STORE_V2 = "okami_v2_store";
const STORAGE_EVENT_NAME = "okami-storage-update";

function emitStorageUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT_NAME));
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

  let newSeasonStatus: WatchStatus = currentSeason.status;
  if (newSeasonStatus === "PLAN_TO_WATCH" && newWatchedCount > 0) {
    newSeasonStatus = "WATCHING";
  }
  if (currentSeason.totalEpisodes > 0 && newWatchedCount >= currentSeason.totalEpisodes) {
    newSeasonStatus = "COMPLETED";
  }

  const updatedSeason: SeasonProgress = {
    ...currentSeason,
    episodesWatched: newWatchedCount,
    watchedEpisodeIds: Array.from(watchedSet).sort((a, b) => a - b),
    status: newSeasonStatus,
    updatedAt: Date.now(),
  };

  const updatedSeasons = {
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
        updatedAt: Date.now(),
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

  if (watchedSet.has(episodeNumber)) {
    watchedSet.delete(episodeNumber);
  } else {
    watchedSet.add(episodeNumber);
  }

  const watchedArray = Array.from(watchedSet).sort((a, b) => a - b);
  const episodesWatched = watchedArray.length;

  let newSeasonStatus: WatchStatus = currentSeason.status;
  if (currentSeason.totalEpisodes > 0 && episodesWatched >= currentSeason.totalEpisodes) {
    newSeasonStatus = "COMPLETED";
  } else if (episodesWatched > 0) {
    newSeasonStatus = "WATCHING";
  } else if (episodesWatched === 0 && currentSeason.status === "WATCHING") {
    newSeasonStatus = "PLAN_TO_WATCH";
  }

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
  const updatedManga: MangaProgress = {
    ...currentManga,
    ...patch,
    updatedAt: Date.now(),
  };

  // Start reading if it was planned
  if (
    updatedManga.status === "PLAN_TO_READ" &&
    (updatedManga.chaptersRead > 0 || updatedManga.volumesRead > 0)
  ) {
    updatedManga.status = "READING";
  }

  // Auto-complete when all chapters read
  if (
    updatedManga.totalChapters > 0 &&
    updatedManga.chaptersRead >= updatedManga.totalChapters
  ) {
    updatedManga.status = "COMPLETED";
  }

  const updatedSeries = {
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

  if (hasAnime && franchise.anime) {
    overallStatus = mapWatchStatusToLegacy(franchise.anime.overallStatus);
    const activeSeason = activeSeasonMalId
      ? franchise.anime.seasons[activeSeasonMalId]
      : animeSeasons[0];

    if (activeSeason) {
      activeSeasonNumber = activeSeason.seasonNumber;
      activeSeasonMalId = activeSeason.malId;
      const totalLabel = activeSeason.totalEpisodes > 0 ? String(activeSeason.totalEpisodes) : "?";
      progressLabel =
        totalSeasons > 1
          ? `S${activeSeason.seasonNumber} • Ep ${activeSeason.episodesWatched}/${totalLabel}`
          : `Ep ${activeSeason.episodesWatched}/${totalLabel}`;
    }
  } else if (hasManga && franchise.manga) {
    const activeManga = activeMangaMalId
      ? franchise.manga.series[activeMangaMalId]
      : mangaSeries[0];

    if (activeManga) {
      activeMangaMalId = activeManga.malId;
      overallStatus = mapReadStatusToLegacy(activeManga.status);
      const chTotal = activeManga.totalChapters > 0 ? String(activeManga.totalChapters) : "?";
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
    updatedAt: franchise.updatedAt,
  };
}

// ─── JSON Backup Export / Import ───

export function exportLibraryAsJson(): string {
  const entries = loadEntries();
  const franchises = loadFranchiseEntries();
  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      franchises,
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
