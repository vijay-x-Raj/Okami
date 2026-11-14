import { useState, useEffect } from "react";
import type { OkamiMedia, MediaType } from "./jikan";
import {
  type OkamiEntry,
  type OkamiStatus,
  type UnifiedFranchiseEntry,
  type FranchiseContainedItem,
  getFranchiseDisplayInfo,
} from "./storage";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

export type TriState = "neutral" | "include" | "exclude";

export const libraryFilters = {
  type: [
    { label: "All", value: "all" },
    { label: "Anime", value: "anime" },
    { label: "Manga", value: "manga" },
    { label: "Folders & Collections", value: "folders" },
    { label: "Films", value: "films" },
  ],
  genre: [
    { label: "Action", value: "action" },
    { label: "Sci-Fi", value: "sci-fi" },
    { label: "Seinen", value: "seinen" },
    { label: "Shonen", value: "shonen" },
    { label: "Horror", value: "horror" },
    { label: "Sports", value: "sports" },
    { label: "Fantasy", value: "fantasy" },
    { label: "Romance", value: "romance" },
  ],
  status: [
    { label: "Watching / Reading", value: "watching" },
    { label: "Completed", value: "completed" },
    { label: "On Hold", value: "on_hold" },
    { label: "Dropped", value: "dropped" },
    { label: "Plan to Watch / Read", value: "plan_to_watch" },
    { label: "Favorites", value: "favorites" },
  ],
} as const;

export const statusOptions: Array<{ value: OkamiStatus; label: string; className: string }> = [
  { value: "watching", label: "Watching / Reading", className: "watching" },
  { value: "completed", label: "Completed", className: "completed" },
  { value: "on_hold", label: "On Hold", className: "hold" },
  { value: "dropped", label: "Dropped", className: "dropped" },
  { value: "plan_to_watch", label: "Plan to Watch / Read", className: "plan" },
];

export const sortOptions = [
  "Last Updated",
  "Title A–Z",
  "Score",
  "Total Progress",
  "Unwatched / Unread",
  "Date Added",
  "Year",
] as const;

export const scoreLabels: Record<number, string> = {
  10: "Masterpiece",
  9: "Great",
  8: "Very Good",
  7: "Good",
  6: "Fine",
  5: "Average",
  4: "Bad",
  3: "Very Bad",
  2: "Horrible",
  1: "Appalling",
};

export function statusLabel(status: OkamiStatus, isManga?: boolean): string {
  if (isManga) {
    if (status === "watching") return "Reading";
    if (status === "plan_to_watch") return "Plan to Read";
  } else {
    if (status === "watching") return "Watching";
    if (status === "plan_to_watch") return "Plan to Watch";
  }
  const match = statusOptions.find((option) => option.value === status);
  return match?.label ?? (isManga ? "Plan to Read" : "Plan to Watch");
}

export function statusClass(status: OkamiStatus): string {
  const match = statusOptions.find((option) => option.value === status);
  return match?.className ?? "plan";
}

export function entryCategory(type: string, format?: string): { label: string; className: string } {
  const fmt = format?.toLowerCase?.() ?? "";
  if (fmt.includes("film") || fmt.includes("movie")) {
    return { label: "Film", className: "type-film" };
  }
  if (type === "manga") {
    return { label: "Manga", className: "type-manga" };
  }
  return { label: "Anime", className: "type-anime" };
}

export function entryKey(entry: OkamiEntry): string {
  return `${entry.type}:${entry.id}`;
}

export function mediaKey(media: OkamiMedia): string {
  return `${media.type}:${media.id}`;
}

export function entryToMedia(entry: OkamiEntry): OkamiMedia {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    cover: entry.cover,
    format: entry.format,
    year: entry.year,
    genres: entry.genres,
    official_score: entry.official_score,
    total: entry.total,
    synopsis: entry.notes,
  };
}

export function formatScore(score: number | null | undefined): string {
  if (!score || score <= 0) return "--";
  return score.toFixed(1);
}

export interface UnifiedLibraryItem {
  id: string; // franchiseId or legacy key
  rootMalId: number;
  activeMalId: number;
  title: string;
  cover: string;
  type: "anime" | "manga";
  format: string;
  year: number;
  genres: string[];
  official_score: number;
  user_score: number | null;
  status: OkamiStatus;
  progressLabel: string;
  progressNum: number;
  totalNum: number | null;
  date_added: string;
  is_favourite: boolean;
  franchise?: UnifiedFranchiseEntry;
  legacyEntry?: OkamiEntry;
  unwatchedCount: number;
  unreadCount: number;
  categories: string[];
  updatedAt: number;
  isFolder: boolean;
  folderCovers: string[];
  averageOfficialScore: number;
  itemCount: number;
  completedCount: number;
  containedItems: FranchiseContainedItem[];
}

export function buildUnifiedLibraryItems(
  franchises: Record<string, UnifiedFranchiseEntry>,
  entries: OkamiEntry[]
): UnifiedLibraryItem[] {
  const items: UnifiedLibraryItem[] = [];
  const seenRoots = new Set<string>();

  for (const franchise of Object.values(franchises)) {
    const displayInfo = getFranchiseDisplayInfo(franchise);
    const mediaType = displayInfo.mediaType;

    seenRoots.add(`${mediaType}:${franchise.rootMalId}`);
    if (Array.isArray(franchise.linkedMalIds)) {
      franchise.linkedMalIds.forEach((id) => seenRoots.add(`${mediaType}:${id}`));
    }
    if (franchise.anime?.seasons) {
      Object.keys(franchise.anime.seasons).forEach((id) => seenRoots.add(`anime:${id}`));
    }
    if (franchise.manga?.series) {
      Object.keys(franchise.manga.series).forEach((id) => seenRoots.add(`manga:${id}`));
    }

    const isExplicitManga = franchise.franchiseId.startsWith("franchise_manga_");
    const hasAnime = Boolean(franchise.anime && Object.keys(franchise.anime.seasons || {}).length > 0);
    const hasManga = Boolean(franchise.manga && Object.keys(franchise.manga.series || {}).length > 0);
    const resolvedType: "anime" | "manga" = isExplicitManga || displayInfo.mediaType === "manga" || (hasManga && !hasAnime) ? "manga" : "anime";

    const activeMalId =
      resolvedType === "manga"
        ? (displayInfo.activeMangaMalId || franchise.rootMalId)
        : (displayInfo.activeSeasonMalId || franchise.rootMalId);

    const matchingEntry = entries.find(
      (e) =>
        e.type === resolvedType &&
        (e.id === activeMalId ||
          e.id === franchise.rootMalId ||
          (Array.isArray(franchise.linkedMalIds) && franchise.linkedMalIds.includes(e.id)))
    );

    const franchiseSeason =
      resolvedType === "manga"
        ? (franchise.manga?.series?.[activeMalId] || franchise.manga?.series?.[franchise.rootMalId])
        : (franchise.anime?.seasons?.[activeMalId] || franchise.anime?.seasons?.[franchise.rootMalId]);

    const franchiseUserScore =
      franchiseSeason?.score && franchiseSeason.score > 0 ? franchiseSeason.score : null;

    const resolvedUserScore =
      (matchingEntry?.user_score && matchingEntry.user_score > 0 ? matchingEntry.user_score : null) ??
      franchiseUserScore ??
      null;

    const resolvedOfficialScore = matchingEntry?.official_score || 0;

    const isFolder = displayInfo.isFolder;
    const folderCovers =
      displayInfo.folderCovers && displayInfo.folderCovers.length > 0
        ? displayInfo.folderCovers
        : [franchise.coverImage];

    // Enrich contained items with official scores, formats, years from entries
    const enrichedContainedItems: FranchiseContainedItem[] = (displayInfo.containedItems || []).map((c) => {
      const match = entries.find((e) => e.id === c.id && e.type === c.type);
      return {
        ...c,
        year: match?.year || c.year,
        score: match?.official_score && match.official_score > 0 ? match.official_score : c.score,
        format: match?.format || c.format,
      };
    });

    const validOfficialScores = enrichedContainedItems
      .filter((i) => i.score > 0)
      .map((i) => i.score);
    const averageOfficialScore =
      validOfficialScores.length > 0
        ? Number((validOfficialScores.reduce((a, b) => a + b, 0) / validOfficialScores.length).toFixed(1))
        : (displayInfo.averageScore || resolvedOfficialScore);

    const itemCount = enrichedContainedItems.length > 0 ? enrichedContainedItems.length : (displayInfo.itemCount || 1);
    const completedCount = displayInfo.completedCount || 0;

    items.push({
      id: franchise.franchiseId,
      rootMalId: franchise.rootMalId,
      activeMalId,
      title: franchise.title,
      cover: franchise.coverImage,
      type: resolvedType,
      format: matchingEntry?.format || (resolvedType === "manga" ? "Manga" : "TV Series"),
      year: matchingEntry?.year || 0,
      genres: franchise.genres?.length ? franchise.genres : matchingEntry?.genres || [],
      official_score: isFolder && averageOfficialScore > 0 ? averageOfficialScore : resolvedOfficialScore,
      user_score: resolvedUserScore,
      status: displayInfo.overallStatus,
      progressLabel: displayInfo.progressLabel || "--",
      progressNum: matchingEntry?.progress || displayInfo.totalProgress || 0,
      totalNum: matchingEntry?.total ?? displayInfo.totalAvailable ?? null,
      date_added: new Date(franchise.addedAt || franchise.updatedAt || Date.now()).toISOString(),
      is_favourite: Boolean(franchise.isFavorite || matchingEntry?.is_favourite),
      franchise,
      legacyEntry: matchingEntry,
      unwatchedCount: displayInfo.unwatchedCount,
      unreadCount: displayInfo.unreadCount,
      categories: displayInfo.categories,
      updatedAt: franchise.updatedAt || franchise.addedAt || 0,
      isFolder,
      folderCovers,
      averageOfficialScore,
      itemCount,
      completedCount,
      containedItems: enrichedContainedItems,
    });
  }

  for (const entry of entries) {
    if (seenRoots.has(`${entry.type}:${entry.id}`)) continue;
    const total = entry.total || 0;
    const progress = entry.progress || 0;
    const diff = total > 0 ? Math.max(0, total - progress) : 0;

    items.push({
      id: `legacy_${entry.type}_${entry.id}`,
      rootMalId: entry.id,
      activeMalId: entry.id,
      title: entry.title,
      cover: entry.cover,
      type: entry.type,
      format: entry.format,
      year: entry.year,
      genres: entry.genres,
      official_score: entry.official_score,
      user_score: entry.user_score,
      status: entry.status,
      progressLabel:
        entry.type === "manga"
          ? `Ch ${entry.progress}/${entry.total ?? "?"}`
          : `Ep ${entry.progress}/${entry.total ?? "?"}`,
      progressNum: entry.progress,
      totalNum: entry.total,
      date_added: entry.date_added,
      is_favourite: entry.is_favourite,
      legacyEntry: entry,
      unwatchedCount: entry.type === "anime" ? diff : 0,
      unreadCount: entry.type === "manga" ? diff : 0,
      categories: [],
      updatedAt: new Date(entry.date_added).getTime(),
      isFolder: false,
      folderCovers: [entry.cover],
      averageOfficialScore: entry.official_score || 0,
      itemCount: 1,
      completedCount: entry.status === "completed" ? 1 : 0,
      containedItems: [],
    });
  }

  return items;
}
