"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { JikanEpisode, JikanRelation, MangaVolumeItem, MediaType, OkamiMedia } from "./lib/jikan";
import { formatMediaNumberDisplay } from "./lib/jikan";
import { fetchDetail, fetchEpisodes, fetchFranchiseGraph, fetchRelated, fetchSeason, fetchSeasonDetailed, fetchTop, fetchTopDetailed, fetchVolumes, searchMedia, prefetchMedia } from "./lib/api";
import {
  addEntry,
  type OkamiEntry,
  type OkamiStatus,
  loadEntries,
  removeEntry,
  saveEntries,
  toggleFavourite,
  updateEntry,
  loadFranchiseEntries,
  saveFranchiseEntries,
  migrateLegacyEntries,
  exportLibraryAsJson,
  importLibraryFromJson,
  incrementEpisode,
  incrementChapter,
  bulkWatchEpisodes,
  updateMangaProgress,
  appendHistory,
  findFranchiseByMalId,
  getFranchiseDisplayInfo,
  type UnifiedFranchiseEntry,
  type FranchiseItemOption,
  type FranchiseContainedItem,
  bundleFranchiseEntries,
  updateFranchiseTitle,
  updateContainedSeasonStatus,
  removeItemFromFranchise,
  cleanFranchiseTitle,
  TrackManager,
  type HistoryEntry,
  type CustomCategory,
  loadHistory,
  clearHistory,
  formatRelativeTime,
  loadCustomCategories,
  addCustomCategory,
  importFromMAL,
  importFromAniList,
} from "./lib/storage";
import { Toast, type ToastData } from "./components/Toast";
import { ProfileView } from "./components/ProfileView";
import { LogProgressModal } from "./components/LogProgressModal";

const navItems = [
  {
    label: "Library",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 19V6a2 2 0 012-2h12a2 2 0 012 2v13M4 19a2 2 0 002 2h12a2 2 0 002-2M4 19h16M9 3v4m6-4v4" />
      </svg>
    ),
  },
  {
    label: "Explore",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
  {
    label: "My List",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 6h18M3 12h18M3 18h11" />
      </svg>
    ),
  },
  {
    label: "Profile",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

const libraryFilters = {
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

const statusOptions: Array<{ value: OkamiStatus; label: string; className: string }> = [
  { value: "watching", label: "Watching / Reading", className: "watching" },
  { value: "completed", label: "Completed", className: "completed" },
  { value: "on_hold", label: "On Hold", className: "hold" },
  { value: "dropped", label: "Dropped", className: "dropped" },
  { value: "plan_to_watch", label: "Plan to Watch / Read", className: "plan" },
];

const sortOptions = [
  "Last Updated",
  "Title A–Z",
  "Score",
  "Total Progress",
  "Unwatched / Unread",
  "Date Added",
  "Year",
] as const;

const scoreLabels: Record<number, string> = {
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

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function useOutsideClick(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose, ref]);
}

function statusLabel(status: OkamiStatus, isManga?: boolean) {
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

function statusClass(status: OkamiStatus) {
  const match = statusOptions.find((option) => option.value === status);
  return match?.className ?? "plan";
}

function entryCategory(type: string, format?: string) {
  const fmt = format?.toLowerCase?.() ?? "";
  if (fmt.includes("film") || fmt.includes("movie")) {
    return { label: "Film", className: "type-film" };
  }
  if (type === "manga") {
    return { label: "Manga", className: "type-manga" };
  }
  return { label: "Anime", className: "type-anime" };
}

function entryKey(entry: OkamiEntry) {
  return `${entry.type}:${entry.id}`;
}

function mediaKey(media: OkamiMedia) {
  return `${media.type}:${media.id}`;
}

function entryToMedia(entry: OkamiEntry): OkamiMedia {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    cover: entry.cover,
    year: entry.year,
    format: entry.format,
    genres: entry.genres,
    official_score: entry.official_score,
    total: entry.total,
    synopsis: entry.notes,
  };
}

function formatScore(score: number | null | undefined) {
  if (!score || score <= 0) return "--";
  return score.toFixed(1);
}

// ─── Unified Library Item Representation ───
export type TriState = "neutral" | "include" | "exclude";

interface UnifiedLibraryItem {
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

function buildUnifiedLibraryItems(
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
    const isExplicitAnime = franchise.franchiseId.startsWith("franchise_anime_");
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

    const resolvedOfficialScore =
      matchingEntry?.official_score || 0;

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

function MyListScoreCell({
  score,
  onUpdateScore,
}: {
  score: number | null;
  onUpdateScore: (newScore: number | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2,
      });
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const handleScroll = () => setIsOpen(false);
    document.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const hasScore = typeof score === "number" && score > 0;

  return (
    <div className="mylist-score-cell-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`mylist-score-chip ${hasScore ? "has-score" : "no-score"}`}
        onClick={toggleOpen}
        title={
          hasScore
            ? `Score: ${score}/10 — ${scoreLabels[score] || "Rated"} (Click to edit)`
            : "Click to set your rating (1–10)"
        }
      >
        <span className="score-val">{hasScore ? score : "--"}</span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="mylist-score-popover custom-scroll"
          style={{
            position: "fixed",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="score-popover-header">
            <span>MY RATING</span>
            <span>(1–10)</span>
          </div>
          <div className="score-popover-list custom-scroll">
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => (
              <button
                key={s}
                type="button"
                className={`score-popover-item ${score === s ? "active" : ""}`}
                onClick={() => {
                  onUpdateScore(s);
                  setIsOpen(false);
                }}
              >
                <span className="score-num">{s}</span>
                <span className="score-desc">{scoreLabels[s]}</span>
              </button>
            ))}
            {hasScore && (
              <button
                type="button"
                className="score-popover-clear"
                onClick={() => {
                  onUpdateScore(null);
                  setIsOpen(false);
                }}
              >
                Clear Rating
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryMenu({
  entry,
  onEdit,
  onRemove,
  onToggleFavourite,
}: {
  entry: OkamiEntry;
  onEdit: (entry: OkamiEntry) => void;
  onRemove: (entry: OkamiEntry) => void;
  onToggleFavourite: (entry: OkamiEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="table-action" type="button" onClick={() => setOpen((prev) => !prev)}>
        ⋯
      </button>
      {open ? (
        <div className="menu">
          <button
            className="menu-item"
            type="button"
            onClick={() => {
              onEdit(entry);
              setOpen(false);
            }}
          >
            Edit Entry
          </button>
          <button
            className="menu-item"
            type="button"
            onClick={() => {
              onToggleFavourite(entry);
              setOpen(false);
            }}
          >
            Toggle Favourite
          </button>
          <button
            className="menu-item menu-item-danger"
            type="button"
            onClick={() => {
              if (confirm(`Remove "${entry.title}"?`)) {
                onRemove(entry);
              }
              setOpen(false);
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── 1. Unified Library View with Mihon Optimizations ───

function TriStateFilterChip({
  label,
  state = "neutral",
  variant,
  onClick,
}: {
  label: string;
  state?: TriState;
  variant?: "anime" | "manga";
  onClick: () => void;
}) {
  const icon = state === "include" ? "✓ " : state === "exclude" ? "✕ " : "";
  const variantClass = variant ? `variant-${variant}` : "";
  return (
    <button
      type="button"
      className={`tri-state-chip state-${state} ${variantClass}`}
      onClick={onClick}
      title={`${label}: ${state} (Click to cycle)`}
    >
      <span className="tri-state-indicator">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function LibraryView({
  entries,
  franchises,
  onQuickIncrement,
  activeView,
  setActiveView,
  activeType,
  activeGenre,
  activeStatus,
  sortBy,
  setSortBy,
  onDetail,
  onEdit,
  onRemove,
  onToggleFavourite,
  onExplore,
  onClearFilters,
  onOpenTracker,
  onOpenFolder,
}: {
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
  onQuickIncrement: (item: UnifiedLibraryItem) => void;
  activeView: "grid" | "list";
  setActiveView: (value: "grid" | "list") => void;
  activeType: "all" | "anime" | "manga" | "films" | "folders";
  activeGenre: string;
  activeStatus: OkamiStatus | "favorites" | "";
  sortBy: (typeof sortOptions)[number];
  setSortBy: (value: (typeof sortOptions)[number]) => void;
  onDetail: (media: OkamiMedia) => void;
  onEdit: (entry: OkamiEntry) => void;
  onRemove: (entry: OkamiEntry) => void;
  onToggleFavourite: (entry: OkamiEntry) => void;
  onExplore: () => void;
  onClearFilters: () => void;
  onOpenTracker: (item: UnifiedLibraryItem) => void;
  onOpenFolder: (item: UnifiedLibraryItem) => void;
}) {
  // Mihon state filters: tri-state chips
  const [statusTriState, setStatusTriState] = useState<Record<string, TriState>>({});
  const [typeTriState, setTypeTriState] = useState<Record<string, TriState>>({});
  const [unwatchedTriState, setUnwatchedTriState] = useState<TriState>("neutral");
  const [numberingMode, setNumberingMode] = useState<"relative" | "absolute">("relative");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [categories, setCategories] = useState<CustomCategory[]>(() => loadCustomCategories());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const currentHistory = useMemo(() => {
    const targetType = activeType === "manga" ? "manga" : "anime";
    return history.filter((h) => h.mediaType === targetType);
  }, [history, activeType]);

  useEffect(() => {
    const handleUpdate = () => {
      setCategories(loadCustomCategories());
      setHistory(loadHistory());
    };
    window.addEventListener("okami-storage-update", handleUpdate);
    return () => window.removeEventListener("okami-storage-update", handleUpdate);
  }, []);

  const stats = useMemo(() => TrackManager.calculateStats(franchises), [franchises]);

  const cycleTriState = (current?: TriState): TriState => {
    if (!current || current === "neutral") return "include";
    if (current === "include") return "exclude";
    return "neutral";
  };

  // Unify multi-season franchises and legacy entries into single cohesive entries
  const unifiedItems = useMemo<UnifiedLibraryItem[]>(
    () => buildUnifiedLibraryItems(franchises, entries),
    [franchises, entries]
  );

  const handleOpenItem = (item: UnifiedLibraryItem) => {
    if (item.isFolder) {
      onOpenFolder(item);
    } else {
      onDetail({
        id: item.activeMalId,
        type: item.type === "manga" ? "manga" : "anime",
        title: item.title,
        cover: item.cover,
        year: item.year,
        format: item.format,
        genres: item.genres,
        official_score: item.official_score,
        total: item.totalNum,
      });
    }
  };

  const displayedItems = useMemo(() => {
    const targetType: "anime" | "manga" = activeType === "manga" ? "manga" : "anime";
    let result = unifiedItems.filter((item) => item.type === targetType);

    // 1. Custom Category filter
    if (activeCategory !== "all") {
      result = result.filter((item) =>
        item.categories?.includes(activeCategory)
      );
    }

    // 2. Format / Type Sub-Filter (Tri-State support)
    const hasTypeInclude = Object.values(typeTriState).some((s) => s === "include");
    const hasTypeExclude = Object.values(typeTriState).some((s) => s === "exclude");
    if (hasTypeInclude || hasTypeExclude) {
      result = result.filter((item) => {
        const fmt = (item.format?.toLowerCase() || "");
        const isFilm = fmt.includes("film") || fmt.includes("movie");
        const isTV = fmt.includes("tv");
        const isNovel = fmt.includes("novel");
        const isMangaFormat = fmt.includes("manga");

        if (typeTriState["films"] === "exclude" && isFilm) return false;
        if (typeTriState["tv"] === "exclude" && isTV) return false;
        if (typeTriState["novels"] === "exclude" && isNovel) return false;
        if (typeTriState["manga"] === "exclude" && isMangaFormat) return false;
        if (typeTriState["folders"] === "exclude" && item.isFolder) return false;

        if (hasTypeInclude) {
          if (typeTriState["films"] === "include" && isFilm) return true;
          if (typeTriState["tv"] === "include" && isTV) return true;
          if (typeTriState["novels"] === "include" && isNovel) return true;
          if (typeTriState["manga"] === "include" && isMangaFormat) return true;
          if (typeTriState["folders"] === "include" && item.isFolder) return true;
          return false;
        }
        return true;
      });
    }

    // 3. Status Filter (Tri-State support)
    const hasStatusInclude = Object.values(statusTriState).some((s) => s === "include");
    const hasStatusExclude = Object.values(statusTriState).some((s) => s === "exclude");
    if (hasStatusInclude || hasStatusExclude) {
      result = result.filter((item) => {
        const s = item.status;
        const isFav = item.is_favourite;

        if (statusTriState["favorites"] === "exclude" && isFav) return false;
        if (statusTriState[s] === "exclude") return false;

        if (hasStatusInclude) {
          if (statusTriState["favorites"] === "include" && isFav) return true;
          if (statusTriState[s] === "include") return true;
          return false;
        }
        return true;
      });
    } else if (activeStatus) {
      if (activeStatus === "favorites") {
        result = result.filter((item) => item.is_favourite);
      } else {
        result = result.filter((item) => item.status === activeStatus);
      }
    }

    // 4. Genre Filter
    if (activeGenre) {
      result = result.filter((item) =>
        item.genres?.some((genre) => genre.toLowerCase() === activeGenre.toLowerCase())
      );
    }

    // 5. Unwatched / Unread Filter (Tri-State)
    if (unwatchedTriState === "include") {
      result = result.filter((item) => item.unwatchedCount > 0 || item.unreadCount > 0);
    } else if (unwatchedTriState === "exclude") {
      result = result.filter((item) => item.unwatchedCount === 0 && item.unreadCount === 0);
    }

    // 6. Sorting
    const next = [...result];
    switch (sortBy) {
      case "Last Updated":
        next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        break;
      case "Score":
        next.sort(
          (a, b) =>
            (b.user_score ?? b.official_score ?? 0) -
            (a.user_score ?? a.official_score ?? 0)
        );
        break;
      case "Title A–Z":
        next.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "Total Progress":
        next.sort((a, b) => {
          const aRatio = a.totalNum && a.totalNum > 0 ? a.progressNum / a.totalNum : 0;
          const bRatio = b.totalNum && b.totalNum > 0 ? b.progressNum / b.totalNum : 0;
          return bRatio - aRatio;
        });
        break;
      case "Unwatched / Unread":
        next.sort(
          (a, b) =>
            b.unwatchedCount + b.unreadCount - (a.unwatchedCount + a.unreadCount)
        );
        break;
      case "Year":
        next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        break;
      default:
        next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return next;
  }, [
    unifiedItems,
    activeCategory,
    typeTriState,
    statusTriState,
    unwatchedTriState,
    activeType,
    activeGenre,
    activeStatus,
    sortBy,
  ]);

  const hasAnyTriFilter =
    Object.values(statusTriState).some((s) => s !== "neutral") ||
    Object.values(typeTriState).some((s) => s !== "neutral") ||
    unwatchedTriState !== "neutral";

  const clearAllTriFilters = () => {
    setStatusTriState({});
    setTypeTriState({});
    setUnwatchedTriState("neutral");
    setActiveCategory("all");
    onClearFilters();
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">本棚</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">LIBRARY</span>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Numbering mode toggle */}
            <button
              type="button"
              className={`pill ${numberingMode === "absolute" ? "active" : ""}`}
              onClick={() => setNumberingMode((m) => (m === "relative" ? "absolute" : "relative"))}
              title="Toggle between Season-Relative (S2 Ep 1) and Absolute (Ep 26) numbering"
            >
              Mode: {numberingMode === "relative" ? "Relative" : "Absolute"}
            </button>

            <div className="view-toggle">
              <button
                className={`view-btn ${activeView === "grid" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveView("grid")}
                aria-pressed={activeView === "grid"}
                aria-label="Grid view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                className={`view-btn ${activeView === "list" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveView("list")}
                aria-pressed={activeView === "list"}
                aria-label="List view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="page-sub">Your personal anime &amp; manga franchise vault</div>
      </div>

      {/* ── Statistics Summary Cards (Strictly Scoped to Active Media) ── */}
      <div className="stats-summary-grid">
        {activeType === "manga" ? (
          <>
            <div className="stats-summary-card stats-manga">
              <span className="stats-card-label">Chapters Read</span>
              <span className="stats-card-value" suppressHydrationWarning>{stats.totalChapters.toLocaleString()}</span>
              <span className="stats-card-sub">{stats.totalVolumes} Volumes Tracked</span>
            </div>
            <div className="stats-summary-card stats-manga">
              <span className="stats-card-label">Completed Manga</span>
              <span className="stats-card-value" suppressHydrationWarning>{stats.completedManga}</span>
              <span className="stats-card-sub">Volumes Finished</span>
            </div>
            <div className="stats-summary-card">
              <span className="stats-card-label">Mean Rating</span>
              <span className="stats-card-value" suppressHydrationWarning>{stats.meanScore > 0 ? stats.meanScore.toFixed(1) : "--"}</span>
              <span className="stats-card-sub">Across Manga Vault</span>
            </div>
            <div className="stats-summary-card">
              <span className="stats-card-label">Active Series</span>
              <span className="stats-card-value" suppressHydrationWarning>{displayedItems.length}</span>
              <span className="stats-card-sub">Manga Tracked</span>
            </div>
          </>
        ) : (
          <>
            <div className="stats-summary-card stats-anime">
              <span className="stats-card-label">Episodes Watched</span>
              <span className="stats-card-value" suppressHydrationWarning>{stats.totalEpisodes.toLocaleString()}</span>
              <span className="stats-card-sub">≈ {stats.daysWatched} Days Total</span>
            </div>
            <div className="stats-summary-card stats-anime">
              <span className="stats-card-label">Completed Anime</span>
              <span className="stats-card-value" suppressHydrationWarning>{stats.completedAnime}</span>
              <span className="stats-card-sub">Series Finished</span>
            </div>
            <div className="stats-summary-card">
              <span className="stats-card-label">Mean Rating</span>
              <span className="stats-card-value" suppressHydrationWarning>{stats.meanScore > 0 ? stats.meanScore.toFixed(1) : "--"}</span>
              <span className="stats-card-sub">Across Anime Vault</span>
            </div>
            <div className="stats-summary-card">
              <span className="stats-card-label">Active Series</span>
              <span className="stats-card-value" suppressHydrationWarning>{displayedItems.length}</span>
              <span className="stats-card-sub">Anime Tracked</span>
            </div>
          </>
        )}
      </div>

      {/* ── Recently Watched / Read Activity Shelf (Strictly Scoped to Active Media) ── */}
      {currentHistory.length > 0 && (
        <section className="recent-activity-section">
          <div className="recent-activity-header">
            <div className="recent-activity-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{activeType === "manga" ? "Recent Manga Activity / 最近の履歴" : "Recent Anime Activity / 最近の履歴"}</span>
            </div>
            <button
              type="button"
              className="empty-link"
              style={{ fontSize: "9px", cursor: "pointer", background: "none", border: "none" }}
              onClick={clearHistory}
            >
              Clear History
            </button>
          </div>
          <div className="recent-activity-strip">
            {currentHistory.slice(0, 4).map((h) => (
              <div
                key={h.id}
                className="recent-activity-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  const targetItem = unifiedItems.find(
                    (it) => it.id === h.franchiseId || it.rootMalId === h.malId
                  );
                  if (targetItem) handleOpenItem(targetItem);
                }}
              >
                {h.coverImage && (
                  <img className="activity-card-thumb" src={h.coverImage} alt={h.title} />
                )}
                <div className="activity-card-info">
                  <div className="activity-card-title">{h.title}</div>
                  <div className={`activity-card-meta ${h.mediaType === "manga" ? "manga" : "anime"}`}>
                    <span>{h.mediaType === "anime" ? `Episode ${h.number}` : `Chapter ${h.number}`}</span>
                  </div>
                  <div className="activity-card-time">{formatRelativeTime(h.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Custom Categories Tab Bar ── */}
      <div className="category-tabs-bar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`category-tab-btn ${activeCategory === cat.id ? "active" : ""}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
        <button
          type="button"
          className="category-add-btn"
          onClick={() => {
            const name = prompt("Enter new category name:");
            if (name && name.trim()) {
              addCustomCategory(name.trim());
              setCategories(loadCustomCategories());
            }
          }}
        >
          + Add Category
        </button>
      </div>

      {/* ── Mihon Tri-State Filter Bar ── */}
      <div className="filter-bar" style={{ flexWrap: "wrap", gap: "10px", padding: "10px 14px" }}>
        {/* Status Tri-State */}
        <div className="filter-section" style={{ flexWrap: "wrap", gap: "6px" }}>
          <span className="filter-label">Status</span>
          {libraryFilters.status.map((item) => (
            <TriStateFilterChip
              key={item.value}
              label={item.label}
              state={statusTriState[item.value] || "neutral"}
              onClick={() => {
                setStatusTriState((prev) => ({
                  ...prev,
                  [item.value]: cycleTriState(prev[item.value]),
                }));
              }}
            />
          ))}
        </div>

        <div className="filter-divider" />

        {/* Media Format Tri-State */}
        <div className="filter-section" style={{ gap: "6px" }}>
          <span className="filter-label">Format</span>
          {(activeType === "manga"
            ? [
                { label: "Manga", value: "manga" },
                { label: "Light Novels", value: "novels" },
                { label: "Folders", value: "folders" },
              ]
            : [
                { label: "TV Series", value: "tv" },
                { label: "Films / Movies", value: "films" },
                { label: "Folders", value: "folders" },
              ]
          ).map((item) => (
            <TriStateFilterChip
              key={item.value}
              label={item.label}
              variant={activeType === "manga" ? "manga" : "anime"}
              state={typeTriState[item.value] || "neutral"}
              onClick={() => {
                setTypeTriState((prev) => ({
                  ...prev,
                  [item.value]: cycleTriState(prev[item.value]),
                }));
              }}
            />
          ))}
        </div>

        <div className="filter-divider" />

        {/* Unwatched Filter Chip */}
        <div className="filter-section">
          <span className="filter-label">Unplayed</span>
          <TriStateFilterChip
            label="Unwatched / Unread"
            state={unwatchedTriState}
            onClick={() => setUnwatchedTriState((prev) => cycleTriState(prev))}
          />
        </div>

        <div className="filter-divider" />

        {/* Sort Section */}
        <div className="sort-section">
          <span className="sort-label">Sort</span>
          <select
            className="sort-select"
            aria-label="Sort entries"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as (typeof sortOptions)[number])}
          >
            {sortOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        {hasAnyTriFilter && (
          <button
            type="button"
            className="clear-all-btn"
            style={{ marginLeft: "auto" }}
            onClick={clearAllTriFilters}
          >
            Reset Filters ✕
          </button>
        )}
      </div>

      <div className="count-row" suppressHydrationWarning>
        <span className="count-label">Tracked Franchises</span>
        <span className="count-num" suppressHydrationWarning>{String(unifiedItems.length).padStart(3, "0")}</span>
        <span className="count-label" style={{ marginLeft: 16 }}>
          Showing
        </span>
        <span className="count-num" suppressHydrationWarning>{String(displayedItems.length).padStart(2, "0")}</span>
      </div>

      {unifiedItems.length === 0 ? (
        <div className="empty-state empty-state-large">
          <div className="empty-title">Your vault is empty</div>
          <div className="empty-sub">Discover and add titles from Explore to start tracking.</div>
          <button className="empty-action" type="button" onClick={onExplore}>
            Explore Now →
          </button>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">No entries match this filter</div>
          <div className="empty-sub">Try adjusting your filters or search keywords.</div>
          <button className="empty-link" type="button" onClick={clearAllTriFilters}>
            Clear Filters
          </button>
        </div>
      ) : activeView === "grid" ? (
        <div className="grid library-grid">
          {displayedItems.map((item) => {
            const category = entryCategory(item.type, item.format);
            const isManga = item.type === "manga";

            // Format progress label with relative / absolute toggle
            const formattedProgress =
              numberingMode === "absolute" && item.franchise && !isManga
                ? formatMediaNumberDisplay({
                  mediaType: "anime",
                  number: item.progressNum,
                  mode: "absolute",
                })
                : item.progressLabel;

            return (
              <article
                className={`card ${item.isFolder ? "is-folder" : ""} ${isManga ? "card-manga" : "card-anime"}`}
                key={item.id}
                onMouseEnter={() => {
                  if (!item.isFolder) {
                    prefetchMedia(item.type === "manga" ? "manga" : "anime", item.activeMalId);
                  }
                }}
              >
                <div
                  className="card-img-wrap"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpenItem(item);
                    }
                  }}
                >
                  {item.isFolder ? (
                    <div className="folder-stack-wrap">
                      {item.folderCovers[2] ? (
                        <img className="folder-stack-bg stack-2" src={item.folderCovers[2]} alt="" />
                      ) : null}
                      {item.folderCovers[1] ? (
                        <img className="folder-stack-bg stack-1" src={item.folderCovers[1]} alt="" />
                      ) : null}
                      <img
                        className="card-img folder-stack-main"
                        src={item.folderCovers[0] || item.cover}
                        alt={item.title}
                      />
                    </div>
                  ) : (
                    <img className="card-img" src={item.cover} alt={item.title} />
                  )}

                  {item.isFolder ? (
                    <div className="folder-badge-tag">
                      FOLDER • {item.itemCount} TITLES
                    </div>
                  ) : null}

                  <div className="franchise-pointer-badge">
                    {item.isFolder ? `${item.completedCount}/${item.itemCount} Done` : formattedProgress}
                  </div>
                  <div className="card-img-overlay" />

                  {/* Mihon Unwatched / Unread Badge Pill */}
                  {!item.isFolder && item.unwatchedCount > 0 ? (
                    <div className="unwatched-badge">
                      {item.unwatchedCount} {isManga ? "Ch" : "Ep"} left
                    </div>
                  ) : !item.isFolder && item.unreadCount > 0 ? (
                    <div className="unwatched-badge">
                      {item.unreadCount} Ch left
                    </div>
                  ) : null}

                  <div className="card-actions">
                    {item.isFolder ? (
                      <button
                        className="card-action-btn quick-plus"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenFolder(item);
                        }}
                        title="Open and manage contained titles"
                      >
                        Open Folder
                      </button>
                    ) : (
                      <button
                        className="card-action-btn quick-plus"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onQuickIncrement(item);
                        }}
                        title="Quick +1 progress (with auto-advance)"
                      >
                        +1 {isManga ? "Ch" : "Ep"}
                      </button>
                    )}
                    <button
                      className="card-action-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.isFolder) {
                          onOpenFolder(item);
                        } else {
                          onEdit(
                            item.legacyEntry || {
                              id: item.activeMalId,
                              type: isManga ? "manga" : "anime",
                              title: item.title,
                              cover: item.cover,
                              year: item.year,
                              format: item.format,
                              genres: item.genres,
                              official_score: item.official_score,
                              user_score: item.user_score,
                              status: item.status,
                              progress: item.progressNum,
                              total: item.totalNum,
                              completed_seasons: [],
                              completed_volumes: [],
                              completed_episodes: Array.from({ length: item.progressNum }, (_, i) => i + 1),
                              date_added: item.date_added,
                              notes: "",
                              is_favourite: item.is_favourite,
                            }
                          );
                        }
                      }}
                    >
                      {item.isFolder ? "Manage" : "Update"}
                    </button>
                    <button
                      className="card-action-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.isFolder) {
                          onOpenFolder(item);
                        } else {
                          onDetail({
                            id: item.activeMalId,
                            type: isManga ? "manga" : "anime",
                            title: item.title,
                            cover: item.cover,
                            year: item.year,
                            format: item.format,
                            genres: item.genres,
                            official_score: item.official_score,
                            total: item.totalNum,
                          });
                        }
                      }}
                    >
                      Info
                    </button>
                  </div>
                  <div
                    className={`score-badge ${item.official_score >= 8.5 ? "gold" : ""} ${item.isFolder ? "collection-avg" : ""}`}
                  >
                    {item.isFolder
                      ? `★ ${item.averageOfficialScore ? item.averageOfficialScore.toFixed(1) : item.official_score.toFixed(1)} Avg`
                      : formatScore(item.official_score)}
                  </div>
                  <div className={`status-badge ${statusClass(item.status)}`}>{statusLabel(item.status, isManga)}</div>
                </div>
                <div className="card-info">
                  {item.isFolder ? (
                    <button
                      type="button"
                      className="card-title"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                      }}
                      onClick={() => onOpenFolder(item)}
                    >
                      {item.title}
                    </button>
                  ) : (
                    <Link
                      className="card-title"
                      href={isManga ? `/manga/${item.activeMalId}/info` : `/anime/${item.activeMalId}/info`}
                    >
                      {item.title}
                    </Link>
                  )}
                  <div className="card-meta">
                    <span className={`type-chip ${category.className}`}>
                      {item.isFolder ? "Folder" : category.label}
                    </span>
                    <span className="meta-dot">•</span>
                    <span>{item.year || "--"}</span>
                    <span className="meta-dot">•</span>
                    <span>{item.format}</span>
                    {item.isFolder ? (
                      <>
                        <span className="meta-dot">•</span>
                        <span className="franchise-part-count-pill">
                          {item.itemCount} Parts
                        </span>
                      </>
                    ) : item.franchise &&
                      (Object.keys(item.franchise.anime?.seasons || {}).length > 1 ||
                        Object.keys(item.franchise.manga?.series || {}).length > 1) ? (
                      <>
                        <span className="meta-dot">•</span>
                        <span className="franchise-part-count-pill">
                          {Math.max(
                            Object.keys(item.franchise.anime?.seasons || {}).length,
                            Object.keys(item.franchise.manga?.series || {}).length
                          )}{" "}
                          Parts
                        </span>
                      </>
                    ) : null}
                    {item.is_favourite ? (
                      <>
                        <span className="meta-dot">•</span>
                        <span style={{ color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>FAV</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="library-table">
          <div className="library-row table-header">
            <span>#</span>
            <span>Cover</span>
            <span>Title</span>
            <span>Type</span>
            <span>My Score</span>
            <span>Official</span>
            <span>Status</span>
            <span>Progress</span>
            <span>Unplayed</span>
            <span>Quick +1</span>
            <span>Date Added</span>
            <span>⋯</span>
          </div>
          {displayedItems.map((item, index) => {
            const category = entryCategory(item.type, item.format);
            const isManga = item.type === "manga";
            const unplayedCount = item.unwatchedCount || item.unreadCount || 0;

            return (
              <div
                key={item.id}
                className={`library-row ${index % 2 === 0 ? "row-alt" : ""} ${item.status === "watching" ? "row-watching" : ""}`}
              >
                <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                {item.isFolder ? (
                  <div
                    role="button"
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => onOpenFolder(item)}
                    aria-label={`Open folder for ${item.title}`}
                  >
                    <img className="row-cover" src={item.cover} alt={item.title} />
                  </div>
                ) : (
                  <Link
                    aria-label={`Open details for ${item.title}`}
                    href={isManga ? `/manga/${item.activeMalId}/info` : `/anime/${item.activeMalId}/info`}
                  >
                    <img className="row-cover" src={item.cover} alt={item.title} />
                  </Link>
                )}
                {item.isFolder ? (
                  <div
                    className="title-cell"
                    role="button"
                    tabIndex={0}
                    style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => onOpenFolder(item)}
                  >
                    <span className="folder-badge-tag" style={{ position: "static", display: "inline-block" }}>
                      FOLDER
                    </span>
                    <span>{item.title}</span>
                  </div>
                ) : (
                  <Link
                    className="title-cell"
                    href={isManga ? `/manga/${item.activeMalId}/info` : `/anime/${item.activeMalId}/info`}
                  >
                    {item.title}
                  </Link>
                )}
                <span className={`type-chip ${category.className}`}>
                  {item.isFolder ? "Folder" : category.label}
                </span>
                <span className="mono">{item.user_score ?? "--"}</span>
                <span className="mono" style={{ color: item.isFolder ? "var(--gold)" : undefined }}>
                  {item.isFolder
                    ? `★ ${item.averageOfficialScore ? item.averageOfficialScore.toFixed(1) : item.official_score.toFixed(1)} Avg`
                    : formatScore(item.official_score)}
                </span>
                <span className={`status-chip ${statusClass(item.status)} ${item.type === "manga" ? "manga" : "anime"}`}>
                  {statusLabel(item.status, item.type === "manga")}
                </span>
                <span className="mono">
                  {item.isFolder ? `${item.completedCount}/${item.itemCount} Done` : item.progressLabel}
                </span>
                <span className="mono" style={{ color: unplayedCount > 0 ? "var(--accent)" : "var(--text-3)" }}>
                  {unplayedCount > 0 ? `+${unplayedCount}` : "0"}
                </span>
                <div>
                  {item.isFolder ? (
                    <button
                      className="card-action-btn"
                      style={{ padding: "4px 8px", fontSize: 11 }}
                      type="button"
                      onClick={() => onOpenFolder(item)}
                    >
                      Open Folder
                    </button>
                  ) : (
                    <button
                      className="card-action-btn quick-plus"
                      style={{ padding: "4px 8px", fontSize: 11 }}
                      type="button"
                      onClick={() => onQuickIncrement(item)}
                    >
                      +1 {isManga ? "Ch" : "Ep"}
                    </button>
                  )}
                </div>
                <span className="mono">{item.date_added.slice(0, 10)}</span>
                {item.legacyEntry ? (
                  <EntryMenu
                    entry={item.legacyEntry}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onToggleFavourite={onToggleFavourite}
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── 2. Explore & Real-Time Discovery View ───

const EXPLORE_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
] as const;

const SORT_OPTIONS: Array<{ label: string; value: "trending" | "score" | "popular" | "newest" | "title" }> = [
  { label: "Trending", value: "trending" },
  { label: "Top Rated", value: "score" },
  { label: "Most Popular", value: "popular" },
  { label: "Recently Added", value: "newest" },
  { label: "Title A–Z", value: "title" },
];

const ANIME_FORMATS = [
  { label: "All Formats", value: "" },
  { label: "TV Series", value: "tv" },
  { label: "Film", value: "movie" },
  { label: "OVA / Special", value: "ova" },
];

const MANGA_FORMATS = [
  { label: "All Formats", value: "" },
  { label: "Manga", value: "manga" },
  { label: "Light Novel", value: "novel" },
  { label: "One-Shot", value: "one_shot" },
];

const STATUS_FILTERS = [
  { label: "All Status", value: "" },
  { label: "Airing / Publishing", value: "airing" },
  { label: "Completed", value: "finished" },
  { label: "Upcoming", value: "upcoming" },
];

const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;

// ── Unified Explore Card Component ──
function ExploreMediaCard({
  media,
  entryMap,
  onAdd,
  onDetail,
  index,
  isMultiSelect,
  isSelected,
  onToggleSelect,
}: {
  media: OkamiMedia;
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
  index?: number;
  isMultiSelect?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (media: OkamiMedia) => void;
}) {
  const inLibrary = entryMap.has(mediaKey(media));
  const isAnime = media.type === "anime";
  const infoUrl = isAnime ? `/anime/${media.id}/info` : `/manga/${media.id}/info`;
  const isHighScoring = media.official_score >= 8.5;
  const category = entryCategory(media.type, media.format);

  return (
    <article
      className={`card ${isSelected ? "multi-selected" : ""} ${media.type === "manga" ? "card-manga" : "card-anime"}`}
      key={mediaKey(media)}
      onMouseEnter={() => prefetchMedia(media.type, media.id)}
    >
      <div
        className="card-img-wrap"
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isMultiSelect) {
            onToggleSelect?.(media);
          } else {
            onDetail(media);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (isMultiSelect) {
              onToggleSelect?.(media);
            } else {
              onDetail(media);
            }
          }
        }}
      >
        <img
          className="card-img"
          src={media.cover}
          alt={media.title}
          loading="lazy"
        />
        <div className="card-img-overlay" />

        {/* Multi-Select Checkbox overlay */}
        {isMultiSelect ? (
          <button
            type="button"
            className={`card-select-overlay ${isSelected ? "selected" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect?.(media);
            }}
            title={isSelected ? "Deselect" : "Select title"}
          >
            {isSelected ? "✓" : ""}
          </button>
        ) : null}

        {/* Score badge at top right */}
        <div className={`score-badge ${isHighScoring ? "gold" : ""}`}>
          {formatScore(media.official_score)}
        </div>

        {/* Status badge if already in vault */}
        {inLibrary ? (
          <div className="status-badge watching">In Vault</div>
        ) : null}

        {/* Actions overlay on hover */}
        <div className="card-actions">
          {isMultiSelect ? (
            <button
              className={`card-action-btn ${isSelected ? "in-library" : "primary"}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSelect?.(media);
              }}
            >
              {isSelected ? "✓ Selected" : "+ Select"}
            </button>
          ) : (
            <button
              className={`card-action-btn ${inLibrary ? "in-library" : "primary"}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (inLibrary) {
                  onDetail(media);
                } else {
                  onAdd(media);
                }
              }}
            >
              {inLibrary ? "In Vault ✓" : "+ Add"}
            </button>
          )}
          <button
            className="card-action-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDetail(media);
            }}
          >
            Info
          </button>
        </div>
      </div>

      <div className="card-info">
        <Link className="card-title" href={infoUrl} title={media.title}>
          {media.title}
        </Link>
        <div className="card-meta">
          <span className={`type-chip ${category.className}`}>{category.label}</span>
          <span className="meta-dot">•</span>
          <span>{media.year || "--"}</span>
          <span className="meta-dot">•</span>
          <span>{media.genres[0] || (isAnime ? "Anime" : "Manga")}</span>
          {typeof index === "number" && (
            <>
              <span className="meta-dot">•</span>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>#{String(index + 1).padStart(2, "0")}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Custom Multi-Row & Multi-Column Category Section with Slider ──
function ExploreCategorySection({
  title,
  items,
  entryMap,
  onAdd,
  onDetail,
  onViewAll,
  onLoadMoreBatches,
  hasMoreBatches,
  loadingMoreBatches,
  isMultiSelect,
  selectedCatalogMap,
  onToggleCatalogItem,
}: {
  title: string;
  items: OkamiMedia[];
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
  onViewAll?: () => void;
  onLoadMoreBatches?: () => Promise<void> | void;
  hasMoreBatches?: boolean;
  loadingMoreBatches?: boolean;
  isMultiSelect?: boolean;
  selectedCatalogMap?: Map<number, OkamiMedia>;
  onToggleCatalogItem?: (media: OkamiMedia) => void;
}) {
  const [batchPage, setBatchPage] = useState(1);
  const pageSize = 10; // 2 rows of 5 columns
  const totalBatches = Math.max(1, Math.ceil(items.length / pageSize));

  const currentItems = useMemo(() => {
    const start = (batchPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, batchPage, pageSize]);

  const handleNext = async () => {
    if (batchPage < totalBatches) {
      setBatchPage((prev) => prev + 1);
    } else if (hasMoreBatches && onLoadMoreBatches) {
      await onLoadMoreBatches();
      setBatchPage((prev) => prev + 1);
    }
  };

  return (
    <section className="explore-category-section">
      <div className="explore-category-header">
        <div className="explore-category-title-wrap">
          <h3 className="section-title" style={{ margin: 0 }}>{title}</h3>
          {title.toLowerCase().includes("trending") && (
            <span
              className="trending-badge-viral"
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "9px",
                letterSpacing: "1.5px",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: "2px",
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              VIRAL NOW
            </span>
          )}
          <span className="explore-category-count">({items.length} titles)</span>
        </div>

        <div className="explore-category-actions">
          {onViewAll && (
            <button
              type="button"
              className="explore-view-all-btn"
              onClick={onViewAll}
              title={`Explore all titles in ${title}`}
            >
              <span>Explore All</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Custom Slider / Batch Navigation */}
          {totalBatches > 1 && (
            <div className="explore-batch-nav">
              <button
                type="button"
                className="explore-batch-btn"
                disabled={batchPage <= 1}
                onClick={() => setBatchPage((prev) => Math.max(1, prev - 1))}
                title="Previous 10 items"
              >
                ◀ Prev
              </button>
              <span className="explore-batch-page">
                Page {String(batchPage).padStart(2, "0")} / {String(totalBatches).padStart(2, "0")}
              </span>
              <button
                type="button"
                className="explore-batch-btn"
                disabled={batchPage >= totalBatches && !hasMoreBatches}
                onClick={handleNext}
                title="Next 10 items"
              >
                {loadingMoreBatches ? "..." : "Next ▶"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Row x Multi-Column Grid (2 rows x 5 columns) */}
      <div className="explore-grid">
        {currentItems.map((item, idx) => (
          <ExploreMediaCard
            key={mediaKey(item)}
            media={item}
            entryMap={entryMap}
            onAdd={onAdd}
            onDetail={onDetail}
            index={(batchPage - 1) * pageSize + idx}
            isMultiSelect={isMultiSelect}
            isSelected={selectedCatalogMap?.has(item.id)}
            onToggleSelect={onToggleCatalogItem}
          />
        ))}
      </div>
    </section>
  );
}

interface ExploreCategoryConfig {
  id: string;
  title: string;
  subtitle: string;
  kanji: string;
  type: MediaType;
  categoryType: "season" | "top" | "top-filter" | "genre" | "trending";
  genre?: string;
  filter?: string;
  initialItems?: OkamiMedia[];
}

function DedicatedCategoryView({
  category,
  entryMap,
  onAdd,
  onDetail,
  onBack,
  isMultiSelect,
  selectedCatalogMap,
  onToggleCatalogItem,
}: {
  category: ExploreCategoryConfig;
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
  onBack: () => void;
  isMultiSelect?: boolean;
  selectedCatalogMap?: Map<number, OkamiMedia>;
  onToggleCatalogItem?: (media: OkamiMedia) => void;
}) {
  const [items, setItems] = useState<OkamiMedia[]>(category.initialItems || []);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [activeSort, setActiveSort] = useState<string>("popular");
  const [activeFormat, setActiveFormat] = useState<string>("");

  const formatOptions = category.type === "anime" ? ANIME_FORMATS : MANGA_FORMATS;

  const loadPage = useCallback(
    async (targetPage: number, reset: boolean = false) => {
      setLoading(true);
      try {
        let fetched: OkamiMedia[] = [];
        let hasNext = false;

        if (category.categoryType === "trending") {
          const res = await searchMedia(category.type, "", {
            sort: "trending",
            format: activeFormat || undefined,
            page: targetPage,
            limit: 25,
          });
          fetched = res.data || [];
          hasNext = Boolean(res.pagination?.has_next_page);
        } else if (category.categoryType === "season") {
          const res = await fetchSeasonDetailed({ page: targetPage, limit: 25 });
          fetched = res.data;
          hasNext = Boolean(res.pagination?.has_next_page);
        } else if (category.categoryType === "top") {
          const res = await fetchTopDetailed(category.type, {
            page: targetPage,
            limit: 25,
            filter: category.filter,
          });
          fetched = res.data;
          hasNext = Boolean(res.pagination?.has_next_page);
        } else if (category.categoryType === "top-filter") {
          const res = await fetchTopDetailed(category.type, {
            filter: category.filter,
            page: targetPage,
            limit: 25,
          });
          fetched = res.data;
          hasNext = Boolean(res.pagination?.has_next_page);
        } else if (category.categoryType === "genre") {
          const res = await searchMedia(category.type, "", {
            genres: category.genre,
            format: activeFormat || undefined,
            sort: activeSort !== "trending" ? activeSort : undefined,
            page: targetPage,
            limit: 25,
          });
          fetched = res.data || [];
          hasNext = Boolean(res.pagination?.has_next_page);
        }

        if (reset) {
          setItems(fetched);
        } else {
          setItems((prev) => {
            const existingIds = new Set(prev.map((m) => mediaKey(m)));
            const unique = fetched.filter((m) => !existingIds.has(mediaKey(m)));
            return [...prev, ...unique];
          });
        }
        setPage(targetPage);
        setHasNextPage(hasNext);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [category, activeFormat, activeSort]
  );

  useEffect(() => {
    let active = true;
    if (activeFormat || activeSort !== "popular") {
      Promise.resolve().then(() => {
        if (active) loadPage(1, true);
      });
    }
    return () => {
      active = false;
    };
  }, [activeFormat, activeSort, loadPage]);

  useEffect(() => {
    let active = true;
    if (!category.initialItems || category.initialItems.length === 0) {
      Promise.resolve().then(() => {
        if (active) loadPage(1, true);
      });
    }
    return () => {
      active = false;
    };
  }, [category.initialItems, loadPage]);

  const handleLoadMore = () => {
    if (loading || !hasNextPage) return;
    loadPage(page + 1, false);
  };

  return (
    <div className="explore-dedicated-view">
      <div className="explore-dedicated-header">
        <div className="explore-dedicated-nav-row">
          <button type="button" className="explore-back-btn" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Explore</span>
          </button>
          <span className="explore-dedicated-badge">{category.kanji} {"// FULL COLLECTION"}</span>
        </div>

        <div className="explore-dedicated-title-wrap">
          <div className="explore-dedicated-title-row">
            <h2 className="explore-dedicated-title">{category.title}</h2>
            <span className="explore-dedicated-count">({items.length} titles loaded)</span>
          </div>
          <p className="explore-dedicated-sub">{category.subtitle}</p>
        </div>

        {category.categoryType === "genre" && (
          <div className="explore-dedicated-filter-row">
            <div className="explore-dedicated-filter-group">
              <span className="filter-label">Format:</span>
              <button
                type="button"
                className={`pill ${activeFormat === "" ? "active" : ""}`}
                onClick={() => setActiveFormat("")}
              >
                All
              </button>
              {formatOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`pill ${activeFormat === item.value ? "active" : ""}`}
                  onClick={() => setActiveFormat(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="explore-dedicated-filter-group">
              <span className="filter-label">Sort:</span>
              {SORT_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`pill ${activeSort === item.value ? "active" : ""}`}
                  onClick={() => setActiveSort(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="explore-grid">
        {items.map((item, idx) => (
          <ExploreMediaCard
            key={mediaKey(item)}
            media={item}
            entryMap={entryMap}
            onAdd={onAdd}
            onDetail={onDetail}
            index={idx}
            isMultiSelect={isMultiSelect}
            isSelected={selectedCatalogMap?.has(item.id)}
            onToggleSelect={onToggleCatalogItem}
          />
        ))}
      </div>

      <div className="load-more-container" style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
        {hasNextPage ? (
          <button
            type="button"
            className="load-more-btn"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? "Loading More Titles..." : "Load Next Page ▾"}
          </button>
        ) : (
          <div className="all-loaded-pill" style={{ opacity: 0.7, padding: "8px 16px", fontSize: "11px" }}>
            All available titles in this collection loaded
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom Interactive Full-Width Hero Slider ──
function CustomHeroSlider({
  spotlights,
  onAdd,
  onDetail,
}: {
  spotlights: OkamiMedia[];
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (spotlights.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % spotlights.length);
    }, 6500);
    return () => clearInterval(interval);
  }, [spotlights.length, isPaused]);

  if (!spotlights.length) return null;
  const current = spotlights[slideIndex] || spotlights[0];

  return (
    <div
      className="explore-hero-slider"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Banner */}
      <div
        className="explore-hero-backdrop"
        style={{
          backgroundImage: `url(${current.banner || current.cover})`,
        }}
      />
      <div className="explore-hero-overlay" />

      {/* Custom Slider Navigation Controls */}
      <div className="explore-slider-controls">
        <button
          type="button"
          className="explore-slider-btn"
          onClick={() =>
            setSlideIndex((prev) => (prev - 1 + spotlights.length) % spotlights.length)
          }
          title="Previous Spotlight"
        >
          ◀
        </button>
        <span className="explore-slider-indicator">
          0{slideIndex + 1} / 0{spotlights.length}
        </span>
        <button
          type="button"
          className="explore-slider-btn"
          onClick={() => setSlideIndex((prev) => (prev + 1) % spotlights.length)}
          title="Next Spotlight"
        >
          ▶
        </button>
        <div style={{ display: "flex", gap: 5, marginLeft: 6 }}>
          {spotlights.map((_, i) => (
            <div
              key={i}
              className={`explore-slider-dot ${i === slideIndex ? "active" : ""}`}
              onClick={() => setSlideIndex(i)}
            />
          ))}
        </div>
      </div>

      {/* Slide Content */}
      <div className="explore-hero-content">
        <div className="explore-hero-stamp">
          MAL {formatScore(current.official_score)} • {current.format || (current.type === "anime" ? "TV SERIES" : "MANGA")}
        </div>

        <h2 className="explore-hero-title">{current.title}</h2>

        <div className="explore-hero-tags">
          <span className="tag">{current.format || (current.type === "anime" ? "TV" : "MANGA")}</span>
          {current.year ? <span className="tag">{current.year}</span> : null}
          {current.genres.slice(0, 3).map((genre) => (
            <span key={genre} className="tag">{genre}</span>
          ))}
        </div>

        {current.synopsis && (
          <p className="explore-hero-synopsis">{current.synopsis}</p>
        )}

        <div className="explore-hero-actions">
          <button
            className="hero-btn"
            type="button"
            onClick={() => onAdd(current)}
          >
            + Add to Vault
          </button>
          <button
            className="card-action-btn"
            style={{ padding: "8px 16px", fontSize: "11px" }}
            type="button"
            onClick={() => onDetail(current)}
          >
            Details →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Bundle Into Collection Folder ───

function BundleNamingModal({
  selectedItems,
  initialTitle,
  initialStatus,
  onClose,
  onConfirm,
}: {
  selectedItems: OkamiMedia[];
  initialTitle: string;
  initialStatus: OkamiStatus;
  onClose: () => void;
  onConfirm: (title: string, status: OkamiStatus) => void;
}) {
  const [folderTitle, setFolderTitle] = useState(initialTitle);
  const [folderStatus, setFolderStatus] = useState<OkamiStatus>(initialStatus);

  const averageScore = useMemo(() => {
    const valid = selectedItems
      .filter((i) => i.official_score && i.official_score > 0)
      .map((i) => i.official_score!);
    if (valid.length === 0) return 0;
    return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1));
  }, [selectedItems]);

  return (
    <div className="folder-modal-backdrop" onClick={onClose}>
      <div className="folder-modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="folder-modal-header">
          <div style={{ flex: 1 }}>
            <div className="folder-modal-eyebrow">NEW COLLECTION FOLDER • {selectedItems.length} TITLES</div>
            <h2 className="folder-modal-title" style={{ margin: "4px 0" }}>
              Bundle Into Collection Folder
            </h2>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>
              Group selected releases under a single cohesive library folder with shared tracking and average rating.
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="folder-modal-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-2)" }}>
                Collection / Folder Title
              </label>
              <input
                className="search-input"
                style={{ width: "100%", fontSize: 14 }}
                value={folderTitle}
                onChange={(e) => setFolderTitle(e.target.value)}
                placeholder="e.g. Attack on Titan Series"
                autoFocus
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-2)" }}>
                  Initial Status
                </label>
                <select
                  className="search-input"
                  style={{ width: "100%", fontSize: 12, padding: "8px 10px", background: "var(--surface-2)" }}
                  value={folderStatus}
                  onChange={(e) => setFolderStatus(e.target.value as OkamiStatus)}
                >
                  <option value="plan_to_watch">Plan to Watch / Read</option>
                  <option value="watching">Watching / Reading</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-2)" }}>
                  Collection MAL Average
                </label>
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--surface-2)",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--gold)",
                  }}
                >
                  ★ {averageScore > 0 ? averageScore.toFixed(1) : "--"} MAL Average
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                Bundled Titles ({selectedItems.length})
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedItems.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px",
                      background: "var(--surface-2)",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <img
                      src={item.cover}
                      alt={item.title}
                      style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 4 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-1)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {idx + 1}. {item.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8, marginTop: 2 }}>
                        <span>{item.format || (item.type === "manga" ? "Manga" : "TV")}</span>
                        {item.year ? <span>• {item.year}</span> : null}
                        {item.official_score ? (
                          <span style={{ color: "var(--gold)", fontWeight: 700 }}>
                            • ★ {item.official_score.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="folder-modal-footer">
          <button type="button" className="folder-action-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="folder-action-btn primary"
            disabled={!folderTitle.trim()}
            onClick={() => onConfirm(folderTitle.trim(), folderStatus)}
          >
            Create Collection Folder ({selectedItems.length} Titles)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Explore View (Unified Theme) ───

function ExploreView({
  activeType,
  onTypeChange,
  entryMap,
  entries,
  franchises,
  onCommitEntries,
  onCommitFranchises,
  onAdd,
  onDetail,
}: {
  activeType: MediaType;
  onTypeChange: (type: MediaType) => void;
  entryMap: Map<string, OkamiEntry>;
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
  onCommitEntries: (entries: OkamiEntry[]) => void;
  onCommitFranchises: (franchises: Record<string, UnifiedFranchiseEntry>) => void;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeSort, setActiveSort] = useState<"trending" | "score" | "popular" | "newest" | "title">("trending");
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeFormat, setActiveFormat] = useState("");
  const [activeSeason, setActiveSeason] = useState("");
  const [activeStatus, setActiveStatus] = useState("");

  const [activeCategoryView, setActiveCategoryView] = useState<ExploreCategoryConfig | null>(null);
  const [loadingBatchCategory, setLoadingBatchCategory] = useState<string | null>(null);

  // Multi-Select Catalog State & Bundle Modal
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedCatalogMap, setSelectedCatalogMap] = useState<Map<number, OkamiMedia>>(new Map());
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleInitialTitle, setBundleInitialTitle] = useState("");

  const handleToggleCatalogItem = (item: OkamiMedia) => {
    setSelectedCatalogMap((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  };

  const handleClearSelected = () => {
    setSelectedCatalogMap(new Map());
  };

  const handleOpenBundleModal = () => {
    const selectedList = Array.from(selectedCatalogMap.values());
    if (selectedList.length === 0) return;
    const primaryItem = selectedList[0];
    const defaultTitle = cleanFranchiseTitle(primaryItem.title);
    setBundleInitialTitle(defaultTitle ? `${defaultTitle} Series` : `${primaryItem.title} Collection`);
    setBundleModalOpen(true);
  };

  const handleConfirmBundle = (customTitle: string, status: OkamiStatus) => {
    const selectedList = Array.from(selectedCatalogMap.values());
    if (selectedList.length === 0) return;

    const primaryItem = selectedList[0];
    const primaryOpt: FranchiseItemOption = {
      id: primaryItem.id,
      title: primaryItem.title,
      type: primaryItem.type,
      format: primaryItem.format || (primaryItem.type === "manga" ? "Manga" : "TV"),
      total: primaryItem.total ?? null,
      cover: primaryItem.cover,
      relation: "Primary Release",
      isCurrent: true,
    };

    const otherOpts: FranchiseItemOption[] = selectedList.map((m, idx) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      format: m.format || (m.type === "manga" ? "Manga" : "TV"),
      total: m.total ?? null,
      cover: m.cover,
      relation: idx === 0 ? "Primary Release" : `Season / Part ${idx + 1}`,
      isCurrent: idx === 0,
    }));

    const finalTitle = customTitle.trim() || `${cleanFranchiseTitle(primaryItem.title)} Collection`;

    const { updatedFranchises } = bundleFranchiseEntries(
      franchises,
      primaryOpt,
      otherOpts,
      0,
      status,
      null,
      `Bundled ${selectedList.length} titles from catalog multi-select`,
      finalTitle,
      true
    );

    onCommitFranchises(updatedFranchises);

    const nextEntries = [...entries];
    const now = new Date().toISOString();
    for (const m of selectedList) {
      if (!nextEntries.some((e) => e.id === m.id && e.type === m.type)) {
        nextEntries.push({
          id: m.id,
          type: m.type,
          title: m.title,
          cover: m.cover,
          year: m.year,
          format: m.format,
          genres: m.genres,
          official_score: m.official_score,
          user_score: null,
          status,
          progress: 0,
          total: m.total ?? null,
          completed_seasons: [],
          completed_volumes: [],
          completed_episodes: [],
          date_added: now,
          notes: `Franchise: ${finalTitle}`,
          is_favourite: false,
        });
      }
    }
    onCommitEntries(nextEntries);

    setSelectedCatalogMap(new Map());
    setIsMultiSelect(false);
    setBundleModalOpen(false);
  };

  const handleAddSelectedIndividually = () => {
    const selectedList = Array.from(selectedCatalogMap.values());
    if (selectedList.length === 0) return;

    const nextEntries = [...entries];
    const now = new Date().toISOString();
    for (const m of selectedList) {
      if (!nextEntries.some((e) => e.id === m.id && e.type === m.type)) {
        nextEntries.push({
          id: m.id,
          type: m.type,
          title: m.title,
          cover: m.cover,
          year: m.year,
          format: m.format,
          genres: m.genres,
          official_score: m.official_score,
          user_score: null,
          status: "plan_to_watch",
          progress: 0,
          total: m.total ?? null,
          completed_seasons: [],
          completed_volumes: [],
          completed_episodes: [],
          date_added: now,
          notes: "",
          is_favourite: false,
        });
      }
    }
    onCommitEntries(nextEntries);

    setSelectedCatalogMap(new Map());
    setIsMultiSelect(false);
  };

  const [results, setResults] = useState<OkamiMedia[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Trending lists (real-time viral & trending releases via sort: "trending")
  const [trendingAnime, setTrendingAnime] = useState<OkamiMedia[]>([]);
  const [trendingManga, setTrendingManga] = useState<OkamiMedia[]>([]);

  // Categorized Anime lists (up to 50 items each for multi-page carousel)
  const [seasonal, setSeasonal] = useState<OkamiMedia[]>([]);
  const [topAnime, setTopAnime] = useState<OkamiMedia[]>([]);
  const [topMovies, setTopMovies] = useState<OkamiMedia[]>([]);
  const [actionAnime, setActionAnime] = useState<OkamiMedia[]>([]);
  const [psychAnime, setPsychAnime] = useState<OkamiMedia[]>([]);

  // Categorized Manga lists (up to 50 items each for multi-page carousel)
  const [topManga, setTopManga] = useState<OkamiMedia[]>([]);
  const [topNovels, setTopNovels] = useState<OkamiMedia[]>([]);
  const [actionManga, setActionManga] = useState<OkamiMedia[]>([]);
  const [romanceManga, setRomanceManga] = useState<OkamiMedia[]>([]);

  const [loadingTop, setLoadingTop] = useState(true);
  const [topError, setTopError] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const isSearchMode = useMemo(() => {
    return (
      debouncedQuery.trim().length > 0 ||
      activeGenres.length > 0 ||
      Boolean(activeSeason) ||
      Boolean(activeFormat) ||
      Boolean(activeStatus) ||
      activeSort !== "trending"
    );
  }, [debouncedQuery, activeGenres, activeSeason, activeFormat, activeStatus, activeSort]);

  const loadDiscovery = useCallback(() => {
    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      if (trendingAnime.length === 0 && seasonal.length === 0 && topAnime.length === 0 && topManga.length === 0) {
        setLoadingTop(true);
      }
      setTopError(false);
    });

    // Fast-path: Load trending & top seasonal/anime first to display content instantly (~200ms)
    Promise.all([
      searchMedia("anime", "", { sort: "trending", limit: 50 }).then((r) => r.data).catch(() => []),
      fetchSeason({ limit: 50 }).catch(() => []),
      fetchTop("anime", { limit: 50 }).catch(() => []),
    ]).then(([trendingData, seasonData, animeData]) => {
      if (!active) return;
      if (trendingData && trendingData.length > 0) setTrendingAnime(trendingData);
      if (seasonData && seasonData.length > 0) setSeasonal(seasonData);
      if (animeData && animeData.length > 0) setTopAnime(animeData);
      setLoadingTop(false);
    });

    // Stream in remaining anime categories
    Promise.all([
      fetchTop("anime", { filter: "movie", limit: 50 }).catch(() => []),
      searchMedia("anime", "", { genres: "Action", limit: 50 }).then((r) => r.data).catch(() => []),
      searchMedia("anime", "", { genres: "Psychological", limit: 50 }).then((r) => r.data).catch(() => []),
    ]).then(([movieData, actAnimeData, psychData]) => {
      if (!active) return;
      setTopMovies(movieData);
      setActionAnime(actAnimeData);
      setPsychAnime(psychData);
    });

    // Stream in manga categories (including trending manga)
    Promise.all([
      searchMedia("manga", "", { sort: "trending", limit: 50 }).then((r) => r.data).catch(() => []),
      fetchTop("manga", { limit: 50 }).catch(() => []),
      fetchTop("manga", { filter: "novels", limit: 50 }).catch(() => []),
      searchMedia("manga", "", { genres: "Action", limit: 50 }).then((r) => r.data).catch(() => []),
      searchMedia("manga", "", { genres: "Romance", limit: 50 }).then((r) => r.data).catch(() => []),
    ]).then(([trendMangaData, mangaData, novelData, actMangaData, romMangaData]) => {
      if (!active) return;
      if (trendMangaData && trendMangaData.length > 0) setTrendingManga(trendMangaData);
      setTopManga(mangaData);
      setTopNovels(novelData);
      setActionManga(actMangaData);
      setRomanceManga(romMangaData);
    });

    return () => {
      active = false;
    };
  }, [trendingAnime.length, trendingManga.length, seasonal.length, topAnime.length, topManga.length]);

  const loadMoreBatches = async (catId: string) => {
    if (loadingBatchCategory) return;
    setLoadingBatchCategory(catId);
    try {
      if (catId === "trendingAnime") {
        const nextPage = Math.floor(trendingAnime.length / 25) + 1;
        const res = await searchMedia("anime", "", { sort: "trending", page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter((m) => !trendingAnime.some((s) => s.id === m.id));
        setTrendingAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "trendingManga") {
        const nextPage = Math.floor(trendingManga.length / 25) + 1;
        const res = await searchMedia("manga", "", { sort: "trending", page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter((m) => !trendingManga.some((s) => s.id === m.id));
        setTrendingManga((prev) => [...prev, ...newItems]);
      } else if (catId === "seasonal") {
        const nextPage = Math.floor(seasonal.length / 25) + 1;
        const res = await fetchSeasonDetailed({ page: nextPage, limit: 30 });
        const newItems = res.data.filter((m) => !seasonal.some((s) => s.id === m.id));
        setSeasonal((prev) => [...prev, ...newItems]);
      } else if (catId === "topAnime") {
        const nextPage = Math.floor(topAnime.length / 25) + 1;
        const res = await fetchTopDetailed("anime", { page: nextPage, limit: 30 });
        const newItems = res.data.filter((m) => !topAnime.some((s) => s.id === m.id));
        setTopAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "topMovies") {
        const nextPage = Math.floor(topMovies.length / 25) + 1;
        const res = await fetchTopDetailed("anime", { filter: "movie", page: nextPage, limit: 30 });
        const newItems = res.data.filter((m) => !topMovies.some((s) => s.id === m.id));
        setTopMovies((prev) => [...prev, ...newItems]);
      } else if (catId === "actionAnime") {
        const nextPage = Math.floor(actionAnime.length / 25) + 1;
        const res = await searchMedia("anime", "", { genres: "Action", page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter((m) => !actionAnime.some((s) => s.id === m.id));
        setActionAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "psychAnime") {
        const nextPage = Math.floor(psychAnime.length / 25) + 1;
        const res = await searchMedia("anime", "", { genres: "Psychological", page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter((m) => !psychAnime.some((s) => s.id === m.id));
        setPsychAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "topManga") {
        const nextPage = Math.floor(topManga.length / 25) + 1;
        const res = await fetchTopDetailed("manga", { page: nextPage, limit: 30 });
        const newItems = res.data.filter((m) => !topManga.some((s) => s.id === m.id));
        setTopManga((prev) => [...prev, ...newItems]);
      } else if (catId === "topNovels") {
        const nextPage = Math.floor(topNovels.length / 25) + 1;
        const res = await fetchTopDetailed("manga", { filter: "novels", page: nextPage, limit: 30 });
        const newItems = res.data.filter((m) => !topNovels.some((s) => s.id === m.id));
        setTopNovels((prev) => [...prev, ...newItems]);
      } else if (catId === "actionManga") {
        const nextPage = Math.floor(actionManga.length / 25) + 1;
        const res = await searchMedia("manga", "", { genres: "Action", page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter((m) => !actionManga.some((s) => s.id === m.id));
        setActionManga((prev) => [...prev, ...newItems]);
      } else if (catId === "romanceManga") {
        const nextPage = Math.floor(romanceManga.length / 25) + 1;
        const res = await searchMedia("manga", "", { genres: "Romance", page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter((m) => !romanceManga.some((s) => s.id === m.id));
        setRomanceManga((prev) => [...prev, ...newItems]);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBatchCategory(null);
    }
  };

  useEffect(() => {
    return loadDiscovery();
  }, [loadDiscovery]);

  // Search effect
  useEffect(() => {
    let active = true;
    if (!isSearchMode) {
      Promise.resolve().then(() => {
        if (!active) return;
        setResults([]);
        setPage(1);
        setHasNextPage(false);
        setTotalResults(null);
        setLoadingSearch(false);
      });
      return () => {
        active = false;
      };
    }

    Promise.resolve().then(() => {
      if (!active) return;
      setLoadingSearch(true);
      setPage(1);
    });

    const controller = new AbortController();

    searchMedia(activeType, debouncedQuery, {
      genres: activeGenres.length > 0 ? activeGenres.join(",") : undefined,
      season: activeSeason || undefined,
      sort: activeSort !== "trending" ? activeSort : undefined,
      format: activeFormat || undefined,
      status: activeStatus || undefined,
      page: 1,
      limit: 25,
      signal: controller.signal,
    })
      .then((res) => {
        if (!active) return;
        setResults(res.data || []);
        setHasNextPage(Boolean(res.pagination?.has_next_page));
        setTotalResults(res.pagination?.total ?? (res.data ? res.data.length : null));
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (!active) return;
        setResults([]);
        setHasNextPage(false);
        setTotalResults(0);
      })
      .finally(() => {
        if (active) setLoadingSearch(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    debouncedQuery,
    activeType,
    activeSort,
    activeGenres,
    activeFormat,
    activeSeason,
    activeStatus,
    isSearchMode,
  ]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasNextPage) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await searchMedia(activeType, debouncedQuery, {
        genres: activeGenres.length > 0 ? activeGenres.join(",") : undefined,
        season: activeSeason || undefined,
        sort: activeSort !== "trending" ? activeSort : undefined,
        format: activeFormat || undefined,
        status: activeStatus || undefined,
        page: nextPage,
        limit: 25,
      });
      const newItems = res.data || [];
      setResults((prev) => [...prev, ...newItems]);
      setPage(nextPage);
      setHasNextPage(Boolean(res.pagination?.has_next_page));
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const handleResetFilters = () => {
    setQuery("");
    setActiveGenres([]);
    setActiveSeason("");
    setActiveFormat("");
    setActiveStatus("");
    setActiveSort("trending");
  };

  const isAnime = activeType === "anime";
  const formatOptions = isAnime ? ANIME_FORMATS : MANGA_FORMATS;

  // Curate 5 top spotlight items for the full-width interactive slider (powered by live trending releases)
  const spotlights = useMemo(() => {
    if (isAnime) {
      const list = [...trendingAnime.slice(0, 3), ...seasonal.slice(0, 2)];
      return list.length ? list : topAnime.slice(0, 5);
    }
    const list = [...trendingManga.slice(0, 3), ...topManga.slice(0, 2)];
    return list.length ? list : topManga.slice(0, 5);
  }, [isAnime, trendingAnime, seasonal, topAnime, trendingManga, topManga]);

  const countActiveFilters =
    (debouncedQuery.trim() ? 1 : 0) +
    activeGenres.length +
    (activeSeason ? 1 : 0) +
    (activeFormat ? 1 : 0) +
    (activeStatus ? 1 : 0) +
    (activeSort !== "trending" ? 1 : 0);

  return (
    <div className={`explore-view ${activeType === "manga" ? "theme-manga" : "theme-anime"}`}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">探索</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">EXPLORE</span>
          <div className="view-toggle" style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className={`pill pill-type type-anime ${activeType === "anime" ? "active" : ""}`}
              onClick={() => {
                onTypeChange("anime");
                setActiveFormat("");
                setActiveCategoryView(null);
              }}
            >
              Anime Catalog
            </button>
            <button
              type="button"
              className={`pill pill-type type-manga ${activeType === "manga" ? "active" : ""}`}
              onClick={() => {
                onTypeChange("manga");
                setActiveFormat("");
                setActiveCategoryView(null);
              }}
            >
              Manga Catalog
            </button>
            <button
              type="button"
              className={`pill ${isMultiSelect ? "active" : ""}`}
              style={{
                borderColor: isMultiSelect ? "var(--accent)" : "var(--border)",
                color: isMultiSelect ? "var(--accent)" : "var(--text-2)",
                fontWeight: isMultiSelect ? 700 : 500,
                background: isMultiSelect ? "var(--accent-dim)" : "var(--surface-2)",
              }}
              onClick={() => {
                setIsMultiSelect(!isMultiSelect);
                if (isMultiSelect) {
                  setSelectedCatalogMap(new Map());
                }
              }}
              title="Toggle multi-select mode to bundle or batch add titles from the catalog"
            >
              {isMultiSelect ? "✓ Multi-Select Active" : "☑ Multi-Select Catalog"}
            </button>
          </div>
        </div>
        <div className="page-sub">Discover trending masterworks, seasonal broadcasts, and uncover hidden gems</div>
      </div>

      {/* ── Standard Search Bar ── */}
      <div className="search-bar">
        <span className="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          className="search-input"
          placeholder={`Search ${activeType === "anime" ? "anime" : "manga"} by title, studio, author, or genre...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setQuery("")}
            title="Clear search"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* ── Filter Matrix Bar ── */}
      <div className="filter-bar" style={{ flexWrap: "wrap", gap: "10px", padding: "10px 14px", marginBottom: "20px" }}>
        {/* Sort */}
        <div className="filter-section">
          <span className="filter-label">Sort</span>
          {SORT_OPTIONS.map((item) => (
            <button
              key={item.value}
              className={`pill ${activeSort === item.value ? "active" : ""}`}
              type="button"
              onClick={() => setActiveSort(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        {/* Format */}
        <div className="filter-section">
          <span className="filter-label">Format</span>
          {formatOptions.map((item) => (
            <button
              key={item.label}
              className={`pill ${activeFormat === item.value ? "active" : ""}`}
              type="button"
              onClick={() => setActiveFormat(activeFormat === item.value ? "" : item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        {/* Status */}
        <div className="filter-section">
          <span className="filter-label">Status</span>
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.label}
              className={`pill ${activeStatus === item.value ? "active" : ""}`}
              type="button"
              onClick={() => setActiveStatus(activeStatus === item.value ? "" : item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Season (anime only) */}
        {isAnime && (
          <>
            <div className="filter-divider" />
            <div className="filter-section">
              <span className="filter-label">Season</span>
              {SEASONS.map((item) => (
                <button
                  key={item}
                  className={`pill ${activeSeason === item ? "active" : ""}`}
                  type="button"
                  onClick={() => setActiveSeason(activeSeason === item ? "" : item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="filter-divider" />

        {/* Genres */}
        <div className="filter-section" style={{ flexWrap: "wrap", width: "100%", marginTop: "4px" }}>
          <span className="filter-label">Genres</span>
          {EXPLORE_GENRES.map((genre) => (
            <button
              key={genre}
              className={`pill ${activeGenres.includes(genre) ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveGenres((prev) =>
                  prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
                );
              }}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active Filters Summary Bar ── */}
      {isSearchMode && (
        <div className="explore-summary-bar">
          <div className="explore-summary-left">
            <span className="explore-results-badge">
              {loadingSearch
                ? "Searching catalog..."
                : `Found ${totalResults !== null ? totalResults : results.length} matching ${activeType} titles`}
            </span>
            {debouncedQuery.trim() && (
              <span className="active-filter-tag">
                Query: &ldquo;{debouncedQuery}&rdquo;
                <button type="button" className="active-filter-remove" onClick={() => setQuery("")}>
                  ✕
                </button>
              </span>
            )}
            {activeSort !== "trending" && (
              <span className="active-filter-tag">
                Sort: {SORT_OPTIONS.find((s) => s.value === activeSort)?.label}
                <button type="button" className="active-filter-remove" onClick={() => setActiveSort("trending")}>
                  ✕
                </button>
              </span>
            )}
            {activeFormat && (
              <span className="active-filter-tag">
                Format: {formatOptions.find((f) => f.value === activeFormat)?.label}
                <button type="button" className="active-filter-remove" onClick={() => setActiveFormat("")}>
                  ✕
                </button>
              </span>
            )}
            {activeStatus && (
              <span className="active-filter-tag">
                Status: {STATUS_FILTERS.find((s) => s.value === activeStatus)?.label}
                <button type="button" className="active-filter-remove" onClick={() => setActiveStatus("")}>
                  ✕
                </button>
              </span>
            )}
            {activeSeason && (
              <span className="active-filter-tag">
                Season: {activeSeason}
                <button type="button" className="active-filter-remove" onClick={() => setActiveSeason("")}>
                  ✕
                </button>
              </span>
            )}
            {activeGenres.map((g) => (
              <span className="active-filter-tag" key={g}>
                Genre: {g}
                <button
                  type="button"
                  className="active-filter-remove"
                  onClick={() => setActiveGenres((prev) => prev.filter((item) => item !== g))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          {countActiveFilters > 0 && (
            <button type="button" className="clear-all-btn" onClick={handleResetFilters}>
              Reset Filters ✕
            </button>
          )}
        </div>
      )}

      {/* ── Main Viewport Content ── */}
      {!isSearchMode ? (
        activeCategoryView ? (
          <DedicatedCategoryView
            category={activeCategoryView}
            entryMap={entryMap}
            onAdd={onAdd}
            onDetail={onDetail}
            onBack={() => setActiveCategoryView(null)}
            isMultiSelect={isMultiSelect}
            selectedCatalogMap={selectedCatalogMap}
            onToggleCatalogItem={handleToggleCatalogItem}
          />
        ) : (
          <>
            {/* 1. Custom Interactive Full-Width Hero Slider */}
            {loadingTop && !spotlights.length ? (
              <div className="skeleton-card" style={{ height: "480px", marginBottom: "24px" }} />
            ) : topError && !spotlights.length ? (
              <div className="empty-state">
                <div className="empty-title">Catalog Temporarily Offline</div>
                <div className="empty-sub">Unable to connect to discovery upstream. Click to reload.</div>
                <button className="empty-action" type="button" onClick={loadDiscovery}>
                  Retry Loading
                </button>
              </div>
            ) : (
              <CustomHeroSlider
                spotlights={spotlights}
                onAdd={onAdd}
                onDetail={onDetail}
              />
            )}

            {/* 2. Structured Multi-Row & Multi-Column Categorized Sections */}
            {isAnime ? (
              <>
                {/* Category 01: Trending Anime Releases */}
                <ExploreCategorySection
                  title="Trending This Week"
                  items={trendingAnime.length > 0 ? trendingAnime : seasonal}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "anime-trending",
                      title: "Trending This Week",
                      subtitle: "The most watched, viral, and talked-about anime series across the globe right now",
                      kanji: "急上昇",
                      type: "anime",
                      categoryType: "trending",
                      initialItems: trendingAnime,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("trendingAnime")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "trendingAnime"}
                />

                {/* Category 02: Top Airing Releases */}
                <ExploreCategorySection
                  title="Current Airing Broadcasts"
                  items={seasonal}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "anime-season",
                      title: "Current Airing Broadcasts",
                      subtitle: "Anime series currently broadcasting this season in Japan",
                      kanji: "今期放送",
                      type: "anime",
                      categoryType: "season",
                      initialItems: seasonal,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("seasonal")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "seasonal"}
                />

                {/* Category 03: All-Time Masterpieces */}
                <ExploreCategorySection
                  title="All-Time Titans & Masterpieces"
                  items={topAnime}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "anime-top",
                      title: "All-Time Titans & Masterpieces",
                      subtitle: "The highest rated and most celebrated anime series of all time",
                      kanji: "最高傑作",
                      type: "anime",
                      categoryType: "top",
                      initialItems: topAnime,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("topAnime")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "topAnime"}
                />

                {/* Category 03: Feature Films & Specials */}
                <ExploreCategorySection
                  title="Feature Films & Cinematic Specials"
                  items={topMovies}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "anime-movies",
                      title: "Feature Films & Cinematic Specials",
                      subtitle: "Award-winning animated theatrical films and standalone cinematic features",
                      kanji: "劇場版",
                      type: "anime",
                      categoryType: "top-filter",
                      filter: "movie",
                      initialItems: topMovies,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("topMovies")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "topMovies"}
                />

                {/* Category 04: High-Octane Action & Shonen */}
                <ExploreCategorySection
                  title="High-Octane Action & Shonen"
                  items={actionAnime}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "anime-action",
                      title: "High-Octane Action & Shonen",
                      subtitle: "Adrenaline-fueled battles, epic martial arts, and heroic shonen sagas",
                      kanji: "少年バトル",
                      type: "anime",
                      categoryType: "genre",
                      genre: "Action",
                      initialItems: actionAnime,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("actionAnime")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "actionAnime"}
                />

                {/* Category 05: Psychological & Dark Seinen */}
                <ExploreCategorySection
                  title="Psychological & Dark Seinen"
                  items={psychAnime}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "anime-psych",
                      title: "Psychological & Dark Seinen",
                      subtitle: "Intricate mind games, psychological thrillers, and gritty adult dramas",
                      kanji: "心理劇",
                      type: "anime",
                      categoryType: "genre",
                      genre: "Psychological",
                      initialItems: psychAnime,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("psychAnime")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "psychAnime"}
                />
              </>
            ) : (
              <>
                {/* Category 01: Trending Manga Releases */}
                <ExploreCategorySection
                  title="Trending This Week"
                  items={trendingManga.length > 0 ? trendingManga : topManga}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "manga-trending",
                      title: "Trending This Week",
                      subtitle: "The most read, trending, and hotly discussed manga releases right now",
                      kanji: "急上昇",
                      type: "manga",
                      categoryType: "trending",
                      initialItems: trendingManga,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("trendingManga")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "trendingManga"}
                />

                {/* Category 02: Top-Tier Manga Classics */}
                <ExploreCategorySection
                  title="Top-Tier Manga Masterpieces"
                  items={topManga}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "manga-top",
                      title: "Top-Tier Manga Masterpieces",
                      subtitle: "Legendary manga series, classics, and critically acclaimed runs",
                      kanji: "名作漫画",
                      type: "manga",
                      categoryType: "top",
                      initialItems: topManga,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("topManga")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "topManga"}
                />

                {/* Category 02: Light Novels & Web Serials */}
                <ExploreCategorySection
                  title="Light Novels & Web Serials"
                  items={topNovels}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "manga-novels",
                      title: "Light Novels & Web Serials",
                      subtitle: "Original light novels, literary fiction, and serialized web works",
                      kanji: "連載小説",
                      type: "manga",
                      categoryType: "top-filter",
                      filter: "novels",
                      initialItems: topNovels,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("topNovels")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "topNovels"}
                />

                {/* Category 03: Action & Dark Fantasy Manga */}
                <ExploreCategorySection
                  title="Action & Dark Fantasy Manga"
                  items={actionManga}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "manga-action",
                      title: "Action & Dark Fantasy Manga",
                      subtitle: "Visceral battles, grim dark fantasy, and high-stakes epics",
                      kanji: "連載異世界",
                      type: "manga",
                      categoryType: "genre",
                      genre: "Action",
                      initialItems: actionManga,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("actionManga")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "actionManga"}
                />

                {/* Category 04: Romance & Character-Driven Manga */}
                <ExploreCategorySection
                  title="Romance & Character-Driven Manga"
                  items={romanceManga}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                  onViewAll={() =>
                    setActiveCategoryView({
                      id: "manga-romance",
                      title: "Romance & Character-Driven Manga",
                      subtitle: "Heartfelt love stories, romantic comedies, and emotional character arcs",
                      kanji: "恋愛物語",
                      type: "manga",
                      categoryType: "genre",
                      genre: "Romance",
                      initialItems: romanceManga,
                    })
                  }
                  onLoadMoreBatches={() => loadMoreBatches("romanceManga")}
                  hasMoreBatches={true}
                  loadingMoreBatches={loadingBatchCategory === "romanceManga"}
                />
              </>
            )}
          </>
        )
      ) : (
        <>
          {/* ── Search Results Grid ── */}
          <div className="explore-category-header" style={{ marginBottom: "16px" }}>
            <div className="explore-category-title-wrap">
              <h3 className="section-title" style={{ margin: 0 }}>Search Results</h3>
              <span className="explore-category-count">
                ({totalResults !== null ? totalResults : results.length} titles found)
              </span>
            </div>
          </div>

          {loadingSearch ? (
            <div className="explore-grid">
              {Array.from({ length: 10 }).map((_, index) => (
                <div className="skeleton-card" key={`skeleton-${index}`}>
                  <div className="skeleton skeleton-img" style={{ aspectRatio: "3 / 4.2" }} />
                  <div className="skeleton-body">
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="empty-state empty-state-large">
              <div className="empty-title">No Matching Titles Found</div>
              <div className="empty-sub">
                No {activeType} records matched your keywords and filters. Try adjusting your search query.
              </div>
              <button className="empty-action" type="button" onClick={handleResetFilters}>
                Clear Search &amp; Filters
              </button>
            </div>
          ) : (
            <>
              <div className="explore-grid">
                {results.map((item, idx) => (
                  <ExploreMediaCard
                    key={mediaKey(item)}
                    media={item}
                    entryMap={entryMap}
                    onAdd={onAdd}
                    onDetail={onDetail}
                    index={idx}
                    isMultiSelect={isMultiSelect}
                    isSelected={selectedCatalogMap.has(item.id)}
                    onToggleSelect={handleToggleCatalogItem}
                  />
                ))}
              </div>

              {hasNextPage && (
                <div className="load-more-container">
                  <button
                    type="button"
                    className="load-more-btn"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading More..." : "Load Next Page ▾"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Catalog Multi-Select Batch Bar ── */}
      {selectedCatalogMap.size > 0 && (
        <div className="catalog-batch-bar">
          <div className="batch-info">
            <span className="batch-badge">{selectedCatalogMap.size}</span>
            <span>{selectedCatalogMap.size === 1 ? "TITLE" : "TITLES"} SELECTED</span>
          </div>
          <div className="batch-actions">
            <button
              type="button"
              className="batch-btn ghost"
              onClick={handleClearSelected}
            >
              Clear
            </button>
            <button
              type="button"
              className="batch-btn secondary"
              onClick={handleAddSelectedIndividually}
              title="Add all selected titles as separate entries in your library"
            >
              + Add All Individually
            </button>
            <button
              type="button"
              className="batch-btn primary"
              onClick={handleOpenBundleModal}
              title="Bundle all selected titles into 1 single unified franchise entry in your library"
            >
              + Add as 1 Unified Entry to Library
            </button>
          </div>
        </div>
      )}

      {bundleModalOpen ? (
        <BundleNamingModal
          selectedItems={Array.from(selectedCatalogMap.values())}
          initialTitle={bundleInitialTitle}
          initialStatus="plan_to_watch"
          onClose={() => setBundleModalOpen(false)}
          onConfirm={handleConfirmBundle}
        />
      ) : null}
    </div>
  );
}

// ─── 3. My List View ───

function MyListView({
  entries,
  franchises,
  activeType = "anime",
  onEdit,
  onRemove,
  onToggleFavourite,
  onCommitEntries,
  onCommitFranchises,
  onOpenTracker,
  onOpenFolder,
  onExplore,
}: {
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
  activeType?: "anime" | "manga";
  onEdit: (entry: OkamiEntry) => void;
  onRemove: (entry: OkamiEntry) => void;
  onToggleFavourite: (entry: OkamiEntry) => void;
  onCommitEntries: (next: OkamiEntry[]) => void;
  onCommitFranchises: (next: Record<string, UnifiedFranchiseEntry>) => void;
  onOpenTracker: (item: UnifiedLibraryItem) => void;
  onOpenFolder?: (item: UnifiedLibraryItem) => void;
  onExplore: () => void;
}) {
  const isManga = activeType === "manga";
  const [activeTab, setActiveTab] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"index" | "title" | "user_score" | "official_score" | "status" | "progress" | "date_added">("date_added");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [editingProgressKey, setEditingProgressKey] = useState<string | null>(null);
  const [editingProgressVal, setEditingProgressVal] = useState<number>(0);

  // Build unified items strictly filtered by active media type (zero anime/manga collision)
  const unifiedItems = useMemo(
    () => buildUnifiedLibraryItems(franchises, entries).filter((item) => item.type === activeType),
    [franchises, entries, activeType]
  );

  // Helper to convert UnifiedLibraryItem to OkamiEntry for edit / remove / favourite
  const getItemEntry = useCallback((item: UnifiedLibraryItem): OkamiEntry => {
    if (item.legacyEntry) return item.legacyEntry;
    return {
      id: item.activeMalId,
      type: item.type === "manga" ? "manga" : "anime",
      title: item.title,
      cover: item.cover,
      year: item.year,
      format: item.format,
      genres: item.genres,
      official_score: item.official_score,
      user_score: item.user_score,
      status: item.status,
      progress: item.progressNum,
      total: item.totalNum,
      completed_seasons: [],
      completed_volumes: [],
      completed_episodes: [],
      date_added: item.date_added,
      notes: "",
      is_favourite: item.is_favourite,
    };
  }, []);

  // Update item progress with complete Mihon auto-state transitions
  const handleUpdateItemProgress = useCallback(
    (item: UnifiedLibraryItem, newProgress: number) => {
      const maxTotal = item.totalNum && item.totalNum > 0 ? item.totalNum : 99999;
      const clamped = Math.max(0, Math.min(newProgress, maxTotal));

      // Auto-state transitions:
      let nextStatus: OkamiStatus = item.status;
      if (clamped > 0 && item.status === "plan_to_watch") {
        nextStatus = "watching";
      }
      if (item.totalNum && clamped >= item.totalNum) {
        nextStatus = "completed";
      }

      // 1. If backed by franchise, update franchise structure
      if (item.franchise) {
        const fId = item.franchise.franchiseId;
        let nextFranchises = { ...franchises };
        if (item.type === "manga") {
          nextFranchises = updateMangaProgress(franchises, fId, item.activeMalId, {
            chaptersRead: clamped,
            status: nextStatus === "completed" ? "COMPLETED" : "READING",
          });
        } else {
          nextFranchises = bulkWatchEpisodes(franchises, fId, item.activeMalId, clamped);
        }
        onCommitFranchises(nextFranchises);
      }

      // 2. Update legacy entries
      if (item.legacyEntry) {
        onCommitEntries(
          updateEntry(entries, item.legacyEntry.id, item.legacyEntry.type, {
            progress: clamped,
            status: nextStatus,
            completed_episodes: Array.from({ length: clamped }, (_, i) => i + 1),
          })
        );
      } else {
        const newEntry: OkamiEntry = {
          id: item.activeMalId,
          type: item.type === "manga" ? "manga" : "anime",
          title: item.title,
          cover: item.cover,
          year: item.year,
          format: item.format,
          genres: item.genres,
          official_score: item.official_score,
          user_score: item.user_score,
          status: nextStatus,
          progress: clamped,
          total: item.totalNum,
          completed_seasons: [],
          completed_volumes: [],
          completed_episodes: Array.from({ length: clamped }, (_, i) => i + 1),
          date_added: item.date_added,
          notes: "",
          is_favourite: item.is_favourite,
        };
        onCommitEntries(addEntry(entries, newEntry));
      }

      // 3. Log to history
      appendHistory({
        franchiseId: item.franchise?.franchiseId || `legacy_${item.activeMalId}`,
        malId: item.activeMalId,
        mediaType: item.type === "manga" ? "manga" : "anime",
        number: clamped,
        title: item.title,
        coverImage: item.cover,
      });
    },
    [franchises, entries, onCommitFranchises, onCommitEntries]
  );

  // Update item score in both stores
  const handleUpdateItemScore = useCallback(
    (item: UnifiedLibraryItem, newScore: number | null) => {
      if (item.franchise) {
        const fId = item.franchise.franchiseId;
        const existing = franchises[fId];
        if (existing) {
          const updated = { ...existing, updatedAt: Date.now() };
          if (item.type === "manga" && updated.manga?.series) {
            const mKey = updated.manga.series[item.activeMalId] ? item.activeMalId : item.rootMalId;
            if (updated.manga.series[mKey]) {
              updated.manga.series[mKey] = {
                ...updated.manga.series[mKey],
                score: newScore ?? 0,
              };
            }
          } else if (updated.anime?.seasons) {
            const aKey = updated.anime.seasons[item.activeMalId] ? item.activeMalId : item.rootMalId;
            if (updated.anime.seasons[aKey]) {
              updated.anime.seasons[aKey] = {
                ...updated.anime.seasons[aKey],
                score: newScore ?? 0,
              };
            }
          }
          onCommitFranchises({ ...franchises, [fId]: updated });
        }
      }

      if (item.legacyEntry) {
        onCommitEntries(
          updateEntry(entries, item.legacyEntry.id, item.legacyEntry.type, {
            user_score: newScore,
          })
        );
      } else {
        const newEntry: OkamiEntry = {
          id: item.activeMalId,
          type: item.type === "manga" ? "manga" : "anime",
          title: item.title,
          cover: item.cover,
          year: item.year,
          format: item.format,
          genres: item.genres,
          official_score: item.official_score,
          user_score: newScore,
          status: item.status,
          progress: item.progressNum,
          total: item.totalNum,
          completed_seasons: [],
          completed_volumes: [],
          completed_episodes: [],
          date_added: item.date_added,
          notes: "",
          is_favourite: item.is_favourite,
        };
        onCommitEntries(addEntry(entries, newEntry));
      }
    },
    [franchises, entries, onCommitFranchises, onCommitEntries]
  );

  // Update item status in both stores
  const handleUpdateItemStatus = useCallback(
    (item: UnifiedLibraryItem, newStatus: OkamiStatus) => {
      if (item.franchise) {
        const fId = item.franchise.franchiseId;
        const existing = franchises[fId];
        if (existing) {
          const updated = { ...existing, updatedAt: Date.now() };
          const watchStat =
            newStatus === "completed"
              ? "COMPLETED"
              : newStatus === "watching"
                ? "WATCHING"
                : newStatus === "on_hold"
                  ? "ON_HOLD"
                  : newStatus === "dropped"
                    ? "DROPPED"
                    : "PLAN_TO_WATCH";
          const readStat =
            newStatus === "completed"
              ? "COMPLETED"
              : newStatus === "watching"
                ? "READING"
                : newStatus === "on_hold"
                  ? "ON_HOLD"
                  : newStatus === "dropped"
                    ? "DROPPED"
                    : "PLAN_TO_READ";

          if (item.type === "manga" && updated.manga?.series?.[item.activeMalId]) {
            updated.manga.series[item.activeMalId] = {
              ...updated.manga.series[item.activeMalId],
              status: readStat,
            };
          } else if (updated.anime?.seasons?.[item.activeMalId]) {
            updated.anime.seasons[item.activeMalId] = {
              ...updated.anime.seasons[item.activeMalId],
              status: watchStat,
            };
          }
          onCommitFranchises({ ...franchises, [fId]: updated });
        }
      }

      const nextProg = newStatus === "completed" && item.totalNum ? item.totalNum : item.progressNum;

      if (item.legacyEntry) {
        onCommitEntries(
          updateEntry(entries, item.legacyEntry.id, item.legacyEntry.type, {
            status: newStatus,
            progress: nextProg,
            completed_episodes:
              newStatus === "completed" && item.totalNum
                ? Array.from({ length: item.totalNum }, (_, i) => i + 1)
                : item.legacyEntry.completed_episodes,
          })
        );
      } else {
        const newEntry: OkamiEntry = {
          id: item.activeMalId,
          type: item.type === "manga" ? "manga" : "anime",
          title: item.title,
          cover: item.cover,
          year: item.year,
          format: item.format,
          genres: item.genres,
          official_score: item.official_score,
          user_score: item.user_score,
          status: newStatus,
          progress: nextProg,
          total: item.totalNum,
          completed_seasons: [],
          completed_volumes: [],
          completed_episodes: Array.from({ length: nextProg }, (_, i) => i + 1),
          date_added: item.date_added,
          notes: "",
          is_favourite: item.is_favourite,
        };
        onCommitEntries(addEntry(entries, newEntry));
      }
    },
    [franchises, entries, onCommitFranchises, onCommitEntries]
  );

  // Tab counts
  const tabCounts = useMemo(() => {
    let watching = 0;
    let completed = 0;
    let on_hold = 0;
    let dropped = 0;
    let plan = 0;
    let favourites = 0;

    for (const item of unifiedItems) {
      if (item.is_favourite) favourites += 1;
      if (item.status === "watching") watching += 1;
      else if (item.status === "completed") completed += 1;
      else if (item.status === "on_hold") on_hold += 1;
      else if (item.status === "dropped") dropped += 1;
      else if (item.status === "plan_to_watch") plan += 1;
    }

    return { watching, completed, on_hold, dropped, plan, favourites };
  }, [unifiedItems]);

  const statusTabs = [
    { key: "All", label: "All", count: unifiedItems.length },
    { key: "watching", label: isManga ? "Reading" : "Watching", count: tabCounts.watching },
    { key: "completed", label: "Completed", count: tabCounts.completed },
    { key: "on_hold", label: "On Hold", count: tabCounts.on_hold },
    { key: "dropped", label: "Dropped", count: tabCounts.dropped },
    { key: "plan_to_watch", label: isManga ? "Plan to Read" : "Plan to Watch", count: tabCounts.plan },
    { key: "favourites", label: "Favourites", count: tabCounts.favourites },
  ];

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    let list = [...unifiedItems];

    if (activeTab === "favourites") {
      list = list.filter((item) => item.is_favourite);
    } else if (activeTab === "watching") {
      list = list.filter((item) => item.status === "watching");
    } else if (activeTab === "plan_to_watch") {
      list = list.filter((item) => item.status === "plan_to_watch");
    } else if (activeTab !== "All") {
      list = list.filter((item) => item.status === activeTab);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      if (q.startsWith("score:")) {
        const expr = q.replace("score:", "").trim();
        if (expr.startsWith(">=")) {
          const target = Number(expr.replace(">=", "").trim());
          list = list.filter((item) => typeof item.user_score === "number" && item.user_score >= target);
        } else if (expr.startsWith("<=")) {
          const target = Number(expr.replace("<=", "").trim());
          list = list.filter((item) => typeof item.user_score === "number" && item.user_score <= target);
        } else if (expr.startsWith(">")) {
          const target = Number(expr.replace(">", "").trim());
          list = list.filter((item) => typeof item.user_score === "number" && item.user_score > target);
        } else if (expr.startsWith("<")) {
          const target = Number(expr.replace("<", "").trim());
          list = list.filter((item) => typeof item.user_score === "number" && item.user_score < target);
        } else {
          const target = Number(expr);
          list = list.filter((item) => item.user_score === target);
        }
      } else {
        list = list.filter((item) => {
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchGenres = item.genres.some((g) => g.toLowerCase().includes(q));
          const matchFormat = (item.format || "").toLowerCase().includes(q);
          const matchYear = String(item.year || "").includes(q);
          return matchTitle || matchGenres || matchFormat || matchYear;
        });
      }
    }

    list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "user_score": {
          const sa = typeof a.user_score === "number" && a.user_score > 0 ? a.user_score : -1;
          const sb = typeof b.user_score === "number" && b.user_score > 0 ? b.user_score : -1;
          comparison = sa - sb;
          break;
        }
        case "official_score":
          comparison = (a.official_score || 0) - (b.official_score || 0);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "progress": {
          const pa = a.totalNum && a.totalNum > 0 ? a.progressNum / a.totalNum : a.progressNum;
          const pb = b.totalNum && b.totalNum > 0 ? b.progressNum / b.totalNum : b.progressNum;
          comparison = pa - pb;
          break;
        }
        case "date_added":
          comparison = new Date(a.date_added).getTime() - new Date(b.date_added).getTime();
          break;
        default:
          comparison = 0;
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [unifiedItems, activeType, activeTab, searchQuery, sortField, sortAsc]);

  // Analytics: Score distribution
  const scoreDistribution = useMemo(() => {
    const counts = Array.from({ length: 10 }, (_, index) => ({ score: index + 1, value: 0 }));
    unifiedItems.forEach((item) => {
      if (typeof item.user_score === "number" && item.user_score >= 1 && item.user_score <= 10) {
        const index = Math.round(item.user_score) - 1;
        if (counts[index]) counts[index].value += 1;
      }
    });
    return counts;
  }, [unifiedItems]);

  // Analytics: Genre breakdown
  const genreData = useMemo(() => {
    const map = new Map<string, number>();
    unifiedItems.forEach((item) => {
      item.genres?.forEach((genre) => {
        map.set(genre, (map.get(genre) ?? 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [unifiedItems]);

  const donutStops = useMemo(() => {
    const total = genreData.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return "var(--surface-3) 0 360deg";
    const colors = ["#E8194B", "#3DB89C", "#C4A84F", "#4A4A5A", "#5B5BFF", "#C47B3D"];
    let current = 0;
    return genreData
      .map((item, index) => {
        const start = current;
        const slice = (item.value / total) * 360;
        current += slice;
        return `${colors[index % colors.length]} ${start}deg ${current}deg`;
      })
      .join(", ");
  }, [genreData]);

  // Stat strip calculations
  const meanScore = useMemo(() => {
    const scored = unifiedItems.filter((i) => typeof i.user_score === "number" && i.user_score > 0);
    if (scored.length === 0) return "--";
    return (scored.reduce((sum, i) => sum + (i.user_score || 0), 0) / scored.length).toFixed(1);
  }, [unifiedItems]);

  const handleHeaderClick = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "title" || field === "status");
    }
  };

  const renderSortArrow = (field: typeof sortField) => {
    if (sortField !== field) return null;
    return <span className="mylist-th-sort-icon">{sortAsc ? "▲" : "▼"}</span>;
  };

  const [showAnalytics, setShowAnalytics] = useState(false);

  return (
    <div className="mylist-container">
      {/* ── Page Header matching other sections ── */}
      <div className="page-header list-header">
        <div className="page-title-row">
          <span className="page-title-kanji">一覧</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">MY LIST</span>
          <span className="entries-badge">
            {filteredItems.length} of {unifiedItems.length} titles
          </span>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className={`view-btn ${showAnalytics ? "active" : ""}`}
              style={{
                width: "auto",
                padding: "0 14px",
                gap: 6,
                fontSize: 11,
                fontFamily: "var(--font-mono, monospace)",
                height: 36,
              }}
              onClick={() => setShowAnalytics((prev) => !prev)}
              title="Toggle analytics, score distribution, and genre breakdown"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
              <span>{showAnalytics ? "Hide Analytics" : "View Analytics"}</span>
            </button>
          </div>
        </div>
        <div className="page-sub">
          Manage your personal vault, log progress, and track scores
        </div>
      </div>

      {/* ── Stat Strip ── */}
      <div className="stat-strip">
        <div className="stat-pill">
          <span className="stat-label">Total Titles</span>
          <span className="stat-value">{String(unifiedItems.length).padStart(3, "0")}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Active (Watching / Reading)</span>
          <span className="stat-value">{String(tabCounts.watching).padStart(2, "0")}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{String(tabCounts.completed).padStart(2, "0")}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Mean User Score</span>
          <span className="stat-value">{meanScore}</span>
        </div>
      </div>

      {/* ── Visual Analytics Dashboard (Toggleable) ── */}
      {showAnalytics && (
        <div className="mylist-analytics-grid">
          {/* 1. Score Distribution Bar Chart */}
          <div className="mylist-chart-card">
            <div className="mylist-chart-header">
              <span className="mylist-chart-title">Score Distribution (1–10)</span>
              <span className="mylist-chart-sub">Ratings Breakdown</span>
            </div>
            <div className="mylist-bar-chart">
              {scoreDistribution.map((item) => {
                const maxScoreCount = Math.max(1, ...scoreDistribution.map((s) => s.value));
                const heightPct = (item.value / maxScoreCount) * 100;
                return (
                  <div
                    className="mylist-bar-col"
                    key={item.score}
                    onClick={() => {
                      if (searchQuery === `score:${item.score}`) setSearchQuery("");
                      else setSearchQuery(`score:${item.score}`);
                    }}
                    title={`Score ${item.score}: ${item.value} title${item.value === 1 ? "" : "s"} (click to filter)`}
                  >
                    <span className="mylist-bar-count">{item.value > 0 ? item.value : ""}</span>
                    <div className="mylist-bar-track">
                      <div
                        className="mylist-bar-fill"
                        style={{ height: `${item.value > 0 ? Math.max(8, heightPct) : 2}%` }}
                      />
                    </div>
                    <span className="mylist-bar-label">{item.score}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Genre Composition Donut */}
          <div className="mylist-chart-card">
            <div className="mylist-chart-header">
              <span className="mylist-chart-title">Genre Composition</span>
              <span className="mylist-chart-sub">Top Themes</span>
            </div>
            <div className="mylist-donut-wrap">
              <div className="mylist-donut" style={{ background: `conic-gradient(${donutStops})` }} />
              <div className="mylist-legend-list">
                {genreData.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 11 }}>No genre data recorded yet</div>
                ) : (
                  genreData.map((item, index) => {
                    const colors = ["#E8194B", "#3DB89C", "#C4A84F", "#4A4A5A", "#5B5BFF", "#C47B3D"];
                    return (
                      <div className="mylist-legend-item" key={item.label}>
                        <div className="mylist-legend-left">
                          <span
                            className="mylist-legend-dot"
                            style={{ background: colors[index % colors.length] }}
                          />
                          <span>{item.label}</span>
                        </div>
                        <span className="mylist-legend-value">{item.value}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Tabs ── */}
      <div className="mylist-status-tabs">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`mylist-status-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.label}</span>
            <span className="tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ── Filter & Search Control Bar ── */}
      <div className="mylist-controls-bar">
        <div className="mylist-search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="mylist-search-input"
            type="text"
            placeholder="Search by title, genre, year..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="mylist-search-clear"
              type="button"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="mylist-count-badge">
          Showing {filteredItems.length} of {unifiedItems.length} {isManga ? "manga entries" : "anime entries"}
        </div>
      </div>

      {/* ── Interactive Table ── */}
      <div className="mylist-table custom-scroll">
        <div className="mylist-row table-header">
          <button type="button" className="mylist-th-btn" onClick={() => handleHeaderClick("index")}>
            #
          </button>
          <span>Cover</span>
          <button type="button" className="mylist-th-btn" onClick={() => handleHeaderClick("title")}>
            Title {renderSortArrow("title")}
          </button>
          <span style={{ textAlign: "center" }}>Format</span>
          <button type="button" className="mylist-th-btn" style={{ justifyContent: "center" }} onClick={() => handleHeaderClick("user_score")} title="Sort by your personal rating">
            My Score {renderSortArrow("user_score")}
          </button>
          <button type="button" className="mylist-th-btn" style={{ justifyContent: "center" }} onClick={() => handleHeaderClick("official_score")} title="Sort by official MAL rating">
            MAL Score {renderSortArrow("official_score")}
          </button>
          <button type="button" className="mylist-th-btn" style={{ justifyContent: "center" }} onClick={() => handleHeaderClick("status")}>
            Status {renderSortArrow("status")}
          </button>
          <button type="button" className="mylist-th-btn" style={{ justifyContent: "center" }} onClick={() => handleHeaderClick("progress")}>
            Progress {renderSortArrow("progress")}
          </button>
          <button type="button" className="mylist-th-btn" style={{ justifyContent: "flex-end" }} onClick={() => handleHeaderClick("date_added")}>
            Added {renderSortArrow("date_added")}
          </button>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="mylist-empty-state">
            <div className="mylist-empty-title">NO MATCHING TITLES</div>
            <div className="mylist-empty-sub">
              {unifiedItems.length === 0
                ? "Your vault is empty. Explore trending masterworks and add titles to begin tracking."
                : `No titles found matching "${searchQuery || activeTab}". Adjust your filters or clear search.`}
            </div>
            {unifiedItems.length === 0 ? (
              <button
                className="modal-btn primary"
                type="button"
                style={{ marginTop: 8 }}
                onClick={onExplore}
              >
                Explore Catalog
              </button>
            ) : (
              <button
                className="modal-btn ghost"
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setSearchQuery("");
                  setActiveTab("All");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const category = entryCategory(item.type, item.format);
            const unit = item.type === "manga" ? "Ch" : "Ep";
            const isEditingProg = editingProgressKey === item.id;

            return (
              <div
                key={item.id}
                className={`mylist-row ${item.status === "watching" ? "row-watching" : item.status === "completed" ? "row-completed" : ""}`}
              >
                {/* 1. Index */}
                <span className="mono" style={{ color: "var(--text-3)" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>

                {/* 2. Cover thumbnail */}
                <button
                  type="button"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                  onClick={() => (item.isFolder && onOpenFolder ? onOpenFolder(item) : onOpenTracker(item))}
                  title={item.isFolder ? "Open folder collection" : "Open dedicated media tracker"}
                >
                  <img className="mylist-cover-thumb" src={item.cover} alt={item.title} />
                </button>

                {/* 3. Title */}
                <div className="mylist-title-group">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {item.isFolder ? (
                      <span className="folder-badge-tag" style={{ position: "static", display: "inline-block", padding: "1px 5px", fontSize: 9 }}>
                        FOLDER
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="mylist-title-link"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: item.isFolder ? 700 : 500,
                      }}
                      onClick={() => (item.isFolder && onOpenFolder ? onOpenFolder(item) : onOpenTracker(item))}
                      title={item.title}
                    >
                      {item.title}
                    </button>
                  </div>
                  <div className="mylist-title-meta">
                    <span>
                      {item.isFolder
                        ? `${item.itemCount} Titles Contained`
                        : item.format || (item.type === "manga" ? "Manga" : "TV")}
                    </span>
                    {item.year ? <span>• {item.year}</span> : null}
                    {item.genres?.length ? <span>• {item.genres.slice(0, 2).join(", ")}</span> : null}
                  </div>
                </div>

                {/* 4. Format chip */}
                <div style={{ textAlign: "center" }}>
                  <span className={`type-chip ${category.className}`}>
                    {item.isFolder ? "Folder" : category.label}
                  </span>
                </div>

                {/* 5. User Score (Interactive Popover Score Cell) */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <MyListScoreCell
                    score={item.user_score}
                    onUpdateScore={(newVal) => handleUpdateItemScore(item, newVal)}
                  />
                </div>

                {/* 6. Official MAL Score */}
                <div style={{ textAlign: "center" }}>
                  <span
                    className="mono"
                    style={{ color: "var(--gold)", fontWeight: 700, fontSize: 11 }}
                    title={
                      item.isFolder
                        ? `Official Collection Rating: Average of ${item.itemCount} titles`
                        : `Official MyAnimeList Rating: ${item.official_score ? item.official_score.toFixed(2) : "Unrated"}`
                    }
                  >
                    {item.isFolder
                      ? `★ ${item.averageOfficialScore ? item.averageOfficialScore.toFixed(1) : (item.official_score ? item.official_score.toFixed(1) : "--")} Avg`
                      : item.official_score && item.official_score > 0
                        ? item.official_score.toFixed(1)
                        : "--"}
                  </span>
                </div>

                {/* 7. Interactive Status Select */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <select
                    className={`status-chip status-select ${statusClass(item.status)} ${item.type === "manga" ? "manga" : "anime"}`}
                    value={item.status}
                    onChange={(e) => handleUpdateItemStatus(item, e.target.value as OkamiStatus)}
                    title="Click to change status"
                  >
                    <option value="watching">{item.type === "manga" ? "READING" : "WATCHING"}</option>
                    <option value="completed">COMPLETED</option>
                    <option value="on_hold">ON HOLD</option>
                    <option value="dropped">DROPPED</option>
                    <option value="plan_to_watch">{item.type === "manga" ? "PLAN TO READ" : "PLAN TO WATCH"}</option>
                  </select>
                </div>

                {/* 8. Progress Stepper / Folder Done */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {item.isFolder ? (
                    <button
                      type="button"
                      className="folder-action-btn"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => (onOpenFolder ? onOpenFolder(item) : onOpenTracker(item))}
                    >
                      {item.completedCount}/{item.itemCount} Done (Manage)
                    </button>
                  ) : (
                    <div className="mylist-table-stepper">
                      <button
                        type="button"
                        className="mylist-stepper-btn"
                        onClick={() => handleUpdateItemProgress(item, item.progressNum - 1)}
                        disabled={item.progressNum <= 0}
                        title="Decrease by 1"
                      >
                        -
                      </button>

                      {isEditingProg ? (
                        <input
                          className="inline-input"
                          type="number"
                          min={0}
                          max={item.totalNum ?? 99999}
                          value={editingProgressVal}
                          autoFocus
                          style={{ width: 55, textAlign: "center", fontSize: 11, padding: "1px 2px" }}
                          onChange={(e) => setEditingProgressVal(Number(e.target.value) || 0)}
                          onBlur={() => {
                            handleUpdateItemProgress(item, editingProgressVal);
                            setEditingProgressKey(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateItemProgress(item, editingProgressVal);
                              setEditingProgressKey(null);
                            }
                            if (e.key === "Escape") setEditingProgressKey(null);
                          }}
                        />
                      ) : (
                        <span
                          className="mylist-stepper-value"
                          onClick={() => {
                            setEditingProgressKey(item.id);
                            setEditingProgressVal(item.progressNum);
                          }}
                          title="Click to type exact progress"
                        >
                          {unit} {item.progressNum} / {item.totalNum ?? "?"}
                        </span>
                      )}

                      <button
                        type="button"
                        className="mylist-stepper-btn"
                        onClick={() => handleUpdateItemProgress(item, item.progressNum + 1)}
                        disabled={item.totalNum !== null && item.progressNum >= item.totalNum}
                        title="Quick +1 progress"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>

                {/* 9. Added Date */}
                <div style={{ textAlign: "right" }}>
                  <span className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>
                    {item.date_added.slice(0, 10)}
                  </span>
                </div>

                {/* 10. Actions Group */}
                <div className="mylist-action-btn-group">
                  {/* Favourite Star */}
                  <button
                    type="button"
                    className={`mylist-icon-btn ${item.is_favourite ? "fav-active" : ""}`}
                    onClick={() => onToggleFavourite(getItemEntry(item))}
                    title={item.is_favourite ? "Remove favourite" : "Add to favourites"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={item.is_favourite ? "var(--gold)" : "none"} stroke={item.is_favourite ? "var(--gold)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>

                  {/* Open Tracker / Folder Link */}
                  <button
                    type="button"
                    className="mylist-icon-btn"
                    onClick={() => (item.isFolder && onOpenFolder ? onOpenFolder(item) : onOpenTracker(item))}
                    title={item.isFolder ? "Open Folder Collection" : "Open Tracker"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>

                  {/* Edit Modal */}
                  <button
                    type="button"
                    className="mylist-icon-btn"
                    onClick={() => (item.isFolder && onOpenFolder ? onOpenFolder(item) : onEdit(getItemEntry(item)))}
                    title={item.isFolder ? "Manage folder collection" : "Edit full entry details"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    className="mylist-icon-btn danger"
                    onClick={() => {
                      if (confirm(`Remove "${item.title}" from your list?`)) {
                        onRemove(getItemEntry(item));
                      }
                    }}
                    title="Delete from list"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── 4. Profile & Data Management View (Imported from components/ProfileView) ───

// ─── Modal Dialogs ───

// ─── Modal: Folder Collection Inspector ───

function FolderModal({
  item,
  franchises,
  onCommitFranchises,
  onClose,
  onOpenTracker,
  onDetail,
}: {
  item: UnifiedLibraryItem;
  franchises: Record<string, UnifiedFranchiseEntry>;
  onCommitFranchises: (franchises: Record<string, UnifiedFranchiseEntry>) => void;
  onClose: () => void;
  onOpenTracker: (item: UnifiedLibraryItem) => void;
  onDetail: (media: OkamiMedia) => void;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(item.title);

  const handleSaveTitle = () => {
    if (!titleInput.trim()) return;
    const next = updateFranchiseTitle(franchises, item.id, titleInput.trim());
    onCommitFranchises(next);
    setIsEditingTitle(false);
  };

  const handleToggleStatus = (malId: number, currentStatus: OkamiStatus) => {
    const nextStatus: OkamiStatus =
      currentStatus === "completed"
        ? "watching"
        : currentStatus === "watching"
        ? "plan_to_watch"
        : "completed";
    const next = updateContainedSeasonStatus(franchises, item.id, malId, nextStatus);
    onCommitFranchises(next);
  };

  const handleMarkAllCompleted = () => {
    let next = { ...franchises };
    for (const c of item.containedItems) {
      next = updateContainedSeasonStatus(next, item.id, c.id, "completed");
    }
    onCommitFranchises(next);
  };

  return (
    <div className="folder-modal-backdrop" onClick={onClose}>
      <div className="folder-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="folder-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="folder-modal-eyebrow">
              COLLECTION FOLDER • {item.containedItems.length} RELEASES
            </div>
            {isEditingTitle ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <input
                  className="search-input"
                  style={{ fontSize: 16, fontWeight: 700, padding: "4px 10px", width: "65%" }}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  autoFocus
                />
                <button type="button" className="folder-action-btn primary" onClick={handleSaveTitle}>
                  Save
                </button>
                <button type="button" className="folder-action-btn" onClick={() => setIsEditingTitle(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <h2 className="folder-modal-title" style={{ margin: 0 }}>
                  {item.title}
                </h2>
                <button
                  type="button"
                  className="folder-action-btn"
                  style={{ fontSize: 10, padding: "2px 8px" }}
                  onClick={() => setIsEditingTitle(true)}
                  title="Rename this collection folder"
                >
                  Rename
                </button>
              </div>
            )}
            <div className="folder-modal-stats">
              <span>
                Progress: <strong style={{ color: "var(--text-1)" }}>{item.completedCount}/{item.itemCount} Completed</strong>
              </span>
              <span>•</span>
              <span style={{ color: "var(--gold)", fontWeight: 700 }}>
                ★ {item.averageOfficialScore ? item.averageOfficialScore.toFixed(1) : (item.official_score ? item.official_score.toFixed(1) : "--")} MAL Average
              </span>
              <span>•</span>
              <span>Format: {item.format || (item.type === "manga" ? "Manga" : "TV Series")}</span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="folder-modal-body">
          <div
            style={{
              marginBottom: 12,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Contained Releases & Chronology ({item.containedItems.length})
          </div>
          <div className="folder-contained-list">
            {item.containedItems.map((c, idx) => {
              const isDone = c.status === "completed";
              return (
                <div key={c.id} className={`folder-contained-card ${isDone ? "completed" : ""}`}>
                  <img className="folder-contained-thumb" src={c.cover} alt={c.title} />
                  <div className="folder-contained-info">
                    <div className="folder-contained-header">
                      <span className={`folder-season-tag ${idx === 0 ? "s1" : ""}`}>
                        {c.seasonNumber ? `Part ${c.seasonNumber}` : `Item ${idx + 1}`}
                      </span>
                      <span className="type-chip anime" style={{ padding: "1px 6px", fontSize: 9 }}>
                        {c.format || (c.type === "manga" ? "Manga" : "TV")}
                      </span>
                      {c.year ? <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{c.year}</span> : null}
                    </div>
                    <div className="folder-contained-title" title={c.title}>
                      {c.title}
                    </div>
                    <div className="folder-contained-meta">
                      {c.total ? <span>{c.total} {c.type === "manga" ? "Chapters" : "Episodes"}</span> : <span>Total: ?</span>}
                      <span>•</span>
                      <span style={{ color: "var(--gold)", fontWeight: 700 }}>
                        ★ {c.score && c.score > 0 ? c.score.toFixed(1) : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="folder-contained-actions">
                    <button
                      type="button"
                      className={`folder-action-btn done-btn ${isDone ? "active" : ""}`}
                      onClick={() => handleToggleStatus(c.id, c.status)}
                      title="Toggle watch status"
                    >
                      {isDone ? "✓ Done" : c.status === "watching" ? "Watching" : "Plan"}
                    </button>
                    <Link
                      href={c.type === "manga" ? `/manga/${c.id}` : `/anime/${c.id}`}
                      className="folder-action-btn primary"
                      onClick={onClose}
                    >
                      Track →
                    </Link>
                    <button
                      type="button"
                      className="folder-action-btn"
                      onClick={() => {
                        onClose();
                        onDetail({
                          id: c.id,
                          type: c.type,
                          title: c.title,
                          cover: c.cover,
                          format: c.format,
                          year: c.year || 0,
                          genres: [],
                          official_score: c.score,
                          total: c.total ?? null,
                        });
                      }}
                    >
                      Info
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="folder-modal-footer">
          <button type="button" className="folder-action-btn" onClick={handleMarkAllCompleted}>
            ✓ Mark All Completed
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="folder-action-btn primary"
              onClick={() => {
                onClose();
                onOpenTracker(item);
              }}
            >
              Open Active Tracker
            </button>
            <button type="button" className="folder-action-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddEntryModal({
  state,
  onClose,
  onSave,
}: {
  state: { media: OkamiMedia; entry?: OkamiEntry } | null;
  onClose: () => void;
  onSave: (data: {
    status: OkamiStatus;
    userScore: number | null;
    notes: string;
    progress: number;
    completedSeasons: number[];
    completedVolumes: number[];
    selectedFranchiseItems?: FranchiseItemOption[];
  }) => void;
}) {
  const media = state?.media;
  const entry = state?.entry;

  const total = media?.total && media.total > 0 ? media.total : null;
  const isManga = media?.type === "manga";
  const unit = isManga ? "Chapters" : "Episodes";

  const [progress, setProgress] = useState<number>(() => Math.max(0, entry?.progress ?? 0));
  const [status, setStatus] = useState<OkamiStatus>(() => entry?.status ?? "plan_to_watch");
  const [userScore, setUserScore] = useState<number | null>(() => entry?.user_score ?? null);
  const [notes, setNotes] = useState(() => entry?.notes ?? "");
  const [inputVal, setInputVal] = useState<string>(() => String(entry?.progress ?? 0));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!media) return null;

  const percent = total !== null && total > 0
    ? Math.min(100, Math.round((progress / total) * 100))
    : 0;

  const remaining = total !== null ? Math.max(0, total - progress) : null;

  const handleProgressChange = (newVal: number) => {
    const clamped = Math.max(0, total !== null ? Math.min(newVal, total) : newVal);
    setProgress(clamped);
    setInputVal(String(clamped));

    if (clamped > 0 && status === "plan_to_watch") {
      setStatus("watching");
    }
    if (total !== null && clamped >= total) {
      setStatus("completed");
    }
  };

  const handleDirectInputChange = (str: string) => {
    setInputVal(str);
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= 0) {
      const clamped = total !== null ? Math.min(num, total) : num;
      setProgress(clamped);
      if (clamped > 0 && status === "plan_to_watch") {
        setStatus("watching");
      }
      if (total !== null && clamped >= total) {
        setStatus("completed");
      }
    }
  };

  return (
    <div className="update-drawer-overlay" onClick={onClose}>
      <aside className={`update-drawer-panel ${isManga ? "theme-manga" : "theme-anime"}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="update-drawer-header">
          <div>
            <div className="update-drawer-eyebrow">
              {isManga ? "// OKAMI MANGA TRACKER" : "// OKAMI ANIME TRACKER"}
            </div>
            <h2 className="update-drawer-title">
              {entry
                ? isManga
                  ? "UPDATE MANGA ENTRY"
                  : "UPDATE ANIME ENTRY"
                : isManga
                  ? "ADD MANGA TO LIBRARY"
                  : "ADD ANIME TO LIBRARY"}
            </h2>
          </div>
          <button
            className="update-drawer-close"
            type="button"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Media Summary Card */}
        <div className="update-drawer-media-card">
          <img
            src={media.cover}
            alt={media.title}
            className="update-drawer-media-cover"
          />
          <div className="update-drawer-media-info">
            <div className="update-drawer-media-title" title={media.title}>
              {media.title}
            </div>
            <div className="update-drawer-badges">
              <span className={`update-media-badge ${media.type}`}>
                {media.type}
              </span>
              <span className="update-media-meta-tag">{media.format}</span>
              {media.year ? (
                <span className="update-media-meta-tag">• {media.year}</span>
              ) : null}
              <span className="update-media-meta-tag">
                • {total ? `${total} ${unit}` : "Ongoing"}
              </span>
            </div>
            <div className="update-drawer-scores-row">
              <span className="update-mal-score">
                MAL {formatScore(media.official_score)}
              </span>
              <span className="update-library-status-badge">
                {entry ? `In Library: ${entry.status.replace("_", " ")}` : "Not in Library"}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="update-drawer-body custom-scroll">
          {/* Progress Tracker Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">
                {isManga ? "01 / CHAPTER TRACKER" : "01 / EPISODE TRACKER"}
              </span>
              <span className={`update-section-badge ${percent === 100 ? "highlight" : ""}`}>
                {total !== null ? `${percent}% COMPLETED` : isManga ? "ONGOING RELEASE" : "ONGOING BROADCAST"}
              </span>
            </div>

            <div className="update-progress-display">
              <div className="update-progress-numbers">
                <span className="update-progress-num-big">{progress}</span>
                <span className="update-progress-total-sub">
                  / {total !== null ? total : "∞"} {unit.toLowerCase()}
                </span>
              </div>
              <div className="update-progress-percent">
                {total !== null ? (
                  remaining === 0 ? (
                    <span style={{ color: "var(--teal)" }}>All Caught Up</span>
                  ) : (
                    <span>{remaining} {unit.toLowerCase()} remaining</span>
                  )
                ) : (
                  <span style={{ color: "var(--gold)" }}>
                    {isManga ? "Ongoing Publication" : "Ongoing Broadcast"}
                  </span>
                )}
              </div>
            </div>

            {total !== null && total > 0 && (
              <div className="update-progress-meter-track">
                <div
                  className="update-progress-meter-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}

            <div className="update-steppers-row">
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress - 10)}
                disabled={progress <= 0}
                title="Back 10"
              >
                -10
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress - 5)}
                disabled={progress <= 0}
                title="Back 5"
              >
                -5
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress - 1)}
                disabled={progress <= 0}
                title="Back 1"
              >
                -1
              </button>

              <div className="update-direct-input-wrap" title={`Directly enter ${isManga ? "chapter" : "episode"} number`}>
                <input
                  type="number"
                  className="update-direct-input"
                  min={0}
                  max={total ?? 99999}
                  value={inputVal}
                  onChange={(e) => handleDirectInputChange(e.target.value)}
                  onBlur={() => setInputVal(String(progress))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress + 1)}
                disabled={total !== null && progress >= total}
                title="Forward 1"
              >
                +1
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress + 5)}
                disabled={total !== null && progress >= total}
                title="Forward 5"
              >
                +5
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress + 10)}
                disabled={total !== null && progress >= total}
                title="Forward 10"
              >
                +10
              </button>
              {total !== null && (
                <button
                  type="button"
                  className="update-stepper-btn max-btn"
                  onClick={() => handleProgressChange(total)}
                  disabled={progress >= total}
                  title="Mark as completed"
                >
                  MAX
                </button>
              )}
            </div>

            <div className="update-quick-step-row">
              <button
                type="button"
                className="update-quick-step-btn"
                onClick={() => handleProgressChange(progress + 1)}
                disabled={total !== null && progress >= total}
              >
                {isManga ? "+1 Chapter Read" : "+1 Episode Watched"}
              </button>
            </div>
          </div>

          {/* Tracking Status Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">02 / TRACKING STATUS</span>
              <span className="update-section-badge">
                {status.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <div className="update-status-grid">
              {statusOptions.map((opt) => {
                const isWatchingOpt = opt.value === "watching";
                const isPlanOpt = opt.value === "plan_to_watch";
                const label = isManga
                  ? isWatchingOpt
                    ? "Reading"
                    : isPlanOpt
                      ? "Plan to Read"
                      : opt.label
                  : isWatchingOpt
                    ? "Watching"
                    : isPlanOpt
                      ? "Plan to Watch"
                      : opt.label;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`update-status-btn ${status === opt.value ? "active" : ""}`}
                    onClick={() => setStatus(opt.value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rating Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">03 / PERSONAL RATING</span>
              {userScore ? (
                <span className="update-score-header-val">
                  {userScore} / 10 — {scoreLabels[userScore]}
                </span>
              ) : (
                <span className="update-section-badge">UNRATED</span>
              )}
            </div>
            <div className="update-score-row">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`update-score-pill ${userScore === num ? "active" : ""}`}
                  onClick={() => setUserScore(userScore === num ? null : num)}
                  title={`${num} - ${scoreLabels[num]}`}
                >
                  {num}
                </button>
              ))}
            </div>
            {userScore !== null && (
              <button
                type="button"
                className="update-score-clear"
                onClick={() => setUserScore(null)}
              >
                Clear Rating
              </button>
            )}
          </div>

          {/* Notes Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">04 / PRIVATE MEMO</span>
              <span className="update-section-badge">{notes.length} CHARS</span>
            </div>
            <textarea
              className="update-notes-textarea custom-scroll"
              rows={3}
              placeholder="Add impressions, bookmarks, or personal reflections..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="update-drawer-footer">
          <Link
            className="modal-btn ghost"
            href={media.type === "anime" ? `/anime/${media.id}` : `/manga/${media.id}`}
            title="Open Tracker Details"
          >
            Tracker →
          </Link>
          <div className="update-drawer-footer-right">
            <button
              className="modal-btn ghost"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="modal-btn primary"
              type="button"
              onClick={() => {
                onSave({
                  status,
                  userScore,
                  notes,
                  progress,
                  completedSeasons: [],
                  completedVolumes: [],
                });
              }}
            >
              {entry ? "Save Changes" : "Add to Library"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Modal: Log Progress (Imported from components/LogProgressModal) ───

function DetailPanel({
  media,
  loading,
  inLibrary,
  entryMap,
  onClose,
  onAdd,
  onSelectRelated,
  onAddRelated,
}: {
  media: OkamiMedia;
  loading: boolean;
  inLibrary: boolean;
  entryMap: Map<string, OkamiEntry>;
  onClose: () => void;
  onAdd: () => void;
  onSelectRelated: (type: MediaType, id: number) => void;
  onAddRelated: (type: MediaType, id: number) => void;
}) {
  type DetailTab = "overview" | "episodes" | "volumes" | "related";
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [episodes, setEpisodes] = useState<JikanEpisode[]>([]);
  const [volumes, setVolumes] = useState<MangaVolumeItem[]>([]);
  const [related, setRelated] = useState<JikanRelation[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const relatedItems = useMemo<
    {
      id: number;
      type: MediaType;
      name: string;
      relation: string;
    }[]
  >(() => {
    return related.flatMap((relation) =>
      (relation.entry || []).map((entry) => ({
        id: entry.mal_id,
        type: entry.type === "manga" ? "manga" : "anime",
        name: entry.name ?? "Untitled",
        relation: relation.relation ?? "Related",
      }))
    );
  }, [related]);

  const handleTabChange = async (tab: DetailTab) => {
    setActiveTab(tab);

    if (tab === "episodes" && media.type === "anime" && episodes.length === 0) {
      setTabLoading(true);
      try {
        const data = await fetchEpisodes(media.id);
        setEpisodes(data.episodes);
      } finally {
        setTabLoading(false);
      }
    }

    if (tab === "volumes" && media.type === "manga" && volumes.length === 0) {
      setTabLoading(true);
      try {
        const data = await fetchVolumes(media.id);
        setVolumes(data.volumes);
      } finally {
        setTabLoading(false);
      }
    }

    if (tab === "related" && related.length === 0) {
      setTabLoading(true);
      try {
        const data = await fetchRelated(media.type, media.id);
        setRelated(data);
      } finally {
        setTabLoading(false);
      }
    }
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <aside className={`detail-panel ${media.type === "manga" ? "theme-manga" : "theme-anime"}`} onClick={(event) => event.stopPropagation()}>
        <button className="detail-close" type="button" onClick={onClose}>
          ✕
        </button>
        <div className="detail-cover-wrap">
          <img className="detail-cover" src={media.cover} alt={media.title} />
        </div>
        <div className="detail-header">
          <div className="detail-title">{media.title}</div>
          <div className="detail-meta">
            <span>{media.year || "--"}</span>
            <span>•</span>
            <span>{media.format}</span>
            <span>•</span>
            <span>{media.total ? `${media.total} total` : "Ongoing"}</span>
          </div>
          <div className="detail-tags">
            {media.genres.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="detail-score">
          <span className="detail-score-label">MAL SCORE</span>
          <span className="detail-score-value">{formatScore(media.official_score)}</span>
        </div>
        <div className="detail-actions">
          <button className="modal-btn primary" type="button" onClick={onAdd}>
            {inLibrary ? "Update Entry" : "Add to Library"}
          </button>
          {media.type === "anime" ? (
            <Link className="modal-btn ghost" href={`/anime/${media.id}`}>
              Open Tracker →
            </Link>
          ) : (
            <Link className="modal-btn ghost" href={`/manga/${media.id}`}>
              Open Tracker →
            </Link>
          )}
        </div>
        <div className="detail-tabs">
          <button
            className={`detail-tab ${activeTab === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => handleTabChange("overview")}
          >
            Overview
          </button>
          {media.type === "anime" ? (
            <button
              className={`detail-tab ${activeTab === "episodes" ? "active" : ""}`}
              type="button"
              onClick={() => handleTabChange("episodes")}
            >
              Episodes
            </button>
          ) : (
            <button
              className={`detail-tab ${activeTab === "volumes" ? "active" : ""}`}
              type="button"
              onClick={() => handleTabChange("volumes")}
            >
              Volumes
            </button>
          )}
          <button
            className={`detail-tab ${activeTab === "related" ? "active" : ""}`}
            type="button"
            onClick={() => handleTabChange("related")}
          >
            Related
          </button>
        </div>

        {activeTab === "overview" ? (
          <div className="detail-section">
            <div className="detail-section-title">Synopsis</div>
            <p className="detail-synopsis">{loading ? "Loading details…" : media.synopsis || "No synopsis yet."}</p>
          </div>
        ) : null}

        {activeTab === "episodes" && media.type === "anime" ? (
          <div className="detail-section">
            {tabLoading ? (
              <div className="detail-empty">Loading episodes…</div>
            ) : episodes.length === 0 ? (
              <div className="detail-empty">No episode data available.</div>
            ) : (
              <div className="detail-list">
                {episodes.map((episode) => (
                  <div className="detail-list-row" key={episode.mal_id}>
                    <span className="detail-list-id">EP.{String(episode.mal_id).padStart(2, "0")}</span>
                    <span className="detail-list-title">
                      {episode.title || episode.title_english || episode.title_japanese || `Episode ${episode.mal_id}`}
                    </span>
                    {episode.duration ? <span className="detail-list-meta">{episode.duration}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "volumes" && media.type === "manga" ? (
          <div className="detail-section">
            {tabLoading ? (
              <div className="detail-empty">Loading volumes…</div>
            ) : volumes.length === 0 ? (
              <div className="detail-empty">No volume data available.</div>
            ) : (
              <div className="detail-list">
                {volumes.map((vol) => (
                  <div className="detail-list-row" key={vol.volumeNumber}>
                    <span className="detail-list-id">VOL.{String(vol.volumeNumber).padStart(2, "0")}</span>
                    <span className="detail-list-title">
                      {vol.title} {vol.estimatedChapters ? `(${vol.estimatedChapters})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "related" ? (
          <div className="detail-section">
            {tabLoading ? (
              <div className="detail-empty">Loading related titles…</div>
            ) : relatedItems.length === 0 ? (
              <div className="detail-empty">No related titles found.</div>
            ) : (
              <div>
                {/* ── Section 1: Related Anime Series ── */}
                {relatedItems.filter((i) => i.type === "anime").length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="franchise-section-divider" style={{ margin: "8px 0 12px" }}>
                      <span className="franchise-section-badge anime">Anime Releases</span>
                      <span className="franchise-section-count">
                        {relatedItems.filter((i) => i.type === "anime").length} Titles
                      </span>
                    </div>
                    <div className="related-grid">
                      {relatedItems
                        .filter((item) => item.type === "anime")
                        .map((item) => {
                          const key = `${item.type}:${item.id}`;
                          const isInLibrary = entryMap.has(key);
                          return (
                            <div className="related-card" key={key}>
                              <div className="related-title">{item.name}</div>
                              <div className="related-meta">
                                <span className={`relation-chip ${item.relation.toLowerCase().replace(/\s+/g, "-")}`}>
                                  {item.relation}
                                </span>
                              </div>
                              <button
                                className={`card-action-btn ${isInLibrary ? "in-library" : "primary"}`}
                                type="button"
                                onClick={() =>
                                  isInLibrary
                                    ? onSelectRelated(item.type, item.id)
                                    : onAddRelated(item.type, item.id)
                                }
                              >
                                {isInLibrary ? "In Library ✓" : "+ Add"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ── Section 2: Related Manga & Light Novels ── */}
                {relatedItems.filter((i) => i.type === "manga").length > 0 && (
                  <div>
                    <div className="franchise-section-divider" style={{ margin: "8px 0 12px" }}>
                      <span className="franchise-section-badge manga">Manga Publications</span>
                      <span className="franchise-section-count">
                        {relatedItems.filter((i) => i.type === "manga").length} Titles
                      </span>
                    </div>
                    <div className="related-grid">
                      {relatedItems
                        .filter((item) => item.type === "manga")
                        .map((item) => {
                          const key = `${item.type}:${item.id}`;
                          const isInLibrary = entryMap.has(key);
                          return (
                            <div className="related-card" key={key}>
                              <div className="related-title">{item.name}</div>
                              <div className="related-meta">
                                <span className={`relation-chip ${item.relation.toLowerCase().replace(/\s+/g, "-")}`}>
                                  {item.relation}
                                </span>
                              </div>
                              <button
                                className={`card-action-btn ${isInLibrary ? "in-library" : "primary"}`}
                                type="button"
                                onClick={() =>
                                  isInLibrary
                                    ? onSelectRelated(item.type, item.id)
                                    : onAddRelated(item.type, item.id)
                                }
                              >
                                {isInLibrary ? "In Library ✓" : "+ Add"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

// ─── Main Okami App Root Component ───

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Library");
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okami_active_tab");
      if (saved === "Manga" || saved === "Anime") return saved;
    }
    return "Anime";
  });
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState<"anime" | "manga">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okami_active_tab");
      if (saved === "Manga") return "manga";
    }
    return "anime";
  });
  const [activeGenre, setActiveGenre] = useState("");
  const [activeStatus, setActiveStatus] = useState<OkamiStatus | "favorites" | "">("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]>("Last Updated");
  const [openFolderItem, setOpenFolderItem] = useState<UnifiedLibraryItem | null>(null);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const mediaType = tab.toLowerCase() === "manga" ? "manga" : "anime";
    setActiveType(mediaType);
    if (typeof window !== "undefined") {
      localStorage.setItem("okami_active_tab", tab);
      document.documentElement.setAttribute("data-theme", mediaType);
    }
  }, []);

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>(() => {
    migrateLegacyEntries();
    return loadFranchiseEntries();
  });

  useEffect(() => {
    migrateLegacyEntries();
    Promise.resolve().then(() => {
      setFranchises(loadFranchiseEntries());
    });
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okami_active_tab");
      const currentTab = saved === "Manga" || saved === "Anime" ? saved : "Anime";
      const mediaType = currentTab.toLowerCase() === "manga" ? "manga" : "anime";
      setActiveTab(currentTab);
      setActiveType(mediaType);
      document.documentElement.setAttribute("data-theme", mediaType);
    }
  }, []);

  const commitEntries = useCallback((next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  }, []);

  const commitFranchises = useCallback((next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  }, []);

  const [toastMessage, setToastMessage] = useState<ToastData | null>(null);

  const showToast = useCallback((text: string, type: "info" | "success" | "warning" = "success") => {
    const id = Date.now();
    setToastMessage({ id, text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.id === id ? null : prev));
    }, 2800);
  }, []);

  const handleQuickIncrement = useCallback(
    (item: UnifiedLibraryItem) => {
      if (item.franchise) {
        const fId = item.franchise.franchiseId;
        if (item.type === "manga") {
          const mangaId = item.activeMalId;
          const nextFranchises = incrementChapter(franchises, fId, mangaId);
          commitFranchises(nextFranchises);
          showToast(`+1 Chapter: ${item.title}`);
        } else {
          const seasonId = item.activeMalId;
          const nextFranchises = incrementEpisode(franchises, fId, seasonId);
          commitFranchises(nextFranchises);
          showToast(`+1 Episode: ${item.title}`);
        }
      }

      if (item.legacyEntry) {
        const e = item.legacyEntry;
        const maxTotal = e.total && e.total > 0 ? e.total : Infinity;
        const nextProg = Math.min(e.progress + 1, maxTotal);
        const nextStat: OkamiStatus = e.total && nextProg >= e.total ? "completed" : "watching";
        commitEntries(
          updateEntry(entries, e.id, e.type, {
            progress: nextProg,
            status: nextStat,
          })
        );
        showToast(`+1 Progress: ${e.title}`);
      }
    },
    [franchises, entries, commitFranchises, commitEntries, showToast]
  );

  const [modalState, setModalState] = useState<{ media: OkamiMedia; entry?: OkamiEntry } | null>(null);
  const [detailMedia, setDetailMedia] = useState<OkamiMedia | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logProgressOpen, setLogProgressOpen] = useState(false);

  // Global Keyboard Shortcuts (/ to search, Escape to dismiss dialogs)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (modalState) setModalState(null);
        else if (detailMedia) setDetailMedia(null);
        else if (openFolderItem) setOpenFolderItem(null);
        else if (logProgressOpen) setLogProgressOpen(false);
      } else if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(".search-input, .mylist-search-input");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalState, detailMedia, openFolderItem, logProgressOpen]);

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entryKey(entry), entry])), [entries]);

  // Real-time calculated profile statistics
  const profileStats = useMemo(() => {
    const totalFranchises = Object.keys(franchises).length;
    let episodesWatched = 0;
    let chaptersRead = 0;
    let volumesRead = 0;

    for (const f of Object.values(franchises)) {
      if (f.anime?.seasons) {
        for (const s of Object.values(f.anime.seasons)) {
          episodesWatched += s.episodesWatched || 0;
        }
      }
      if (f.manga?.series) {
        for (const m of Object.values(f.manga.series)) {
          chaptersRead += m.chaptersRead || 0;
          volumesRead += m.volumesRead || 0;
        }
      }
    }

    // Include any legacy entries
    for (const e of entries) {
      if (!findFranchiseByMalId(franchises, e.id)) {
        if (e.type === "anime") episodesWatched += e.progress || 0;
        else chaptersRead += e.progress || 0;
      }
    }

    const totalTracked = Math.max(totalFranchises, entries.length);
    const daysConsumed = ((episodesWatched * 24 + chaptersRead * 5) / (60 * 24)).toFixed(1);

    const genreMap = new Map<string, number>();
    for (const e of entries) {
      e.genres?.forEach((g) => genreMap.set(g, (genreMap.get(g) || 0) + 1));
    }
    for (const f of Object.values(franchises)) {
      f.genres?.forEach((g) => genreMap.set(g, (genreMap.get(g) || 0) + 1));
    }
    const favoriteGenre = Array.from(genreMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "--";

    const scored = entries.filter((e) => typeof e.user_score === "number" && e.user_score > 0);
    const meanScore = scored.length
      ? (scored.reduce((sum, e) => sum + (e.user_score || 0), 0) / scored.length).toFixed(1)
      : "--";

    return [
      { label: "Franchises", value: String(totalTracked).padStart(3, "0") },
      { label: "Episodes Watched", value: String(episodesWatched) },
      { label: "Chapters Read", value: String(chaptersRead) },
      { label: "Volumes Read", value: String(volumesRead) },
      { label: "Days Consumed", value: daysConsumed },
      { label: "Mean Score", value: meanScore },
      { label: "Favorite Genre", value: favoriteGenre },
    ];
  }, [franchises, entries]);

  const favourites = useMemo(() => entries.filter((entry) => entry.is_favourite), [entries]);

  const viewClass =
    activeNav === "Explore"
      ? "explore"
      : activeNav === "My List"
        ? "list"
        : activeNav === "Profile"
          ? "profile"
          : "library";

  const handleSaveEntry = (data: {
    status: OkamiStatus;
    userScore: number | null;
    notes: string;
    progress: number;
    completedSeasons: number[];
    completedVolumes: number[];
    selectedFranchiseItems?: FranchiseItemOption[];
  }) => {
    if (!modalState) return;
    const { media, entry } = modalState;
    const now = new Date().toISOString();

    let finalStatus = data.status;
    const maxTotal = media.total && media.total > 0 ? media.total : Infinity;
    const clampedProgress = Math.max(0, Math.min(data.progress, maxTotal));

    if (clampedProgress > 0 && finalStatus === "plan_to_watch") {
      finalStatus = "watching";
    }
    if (media.total && clampedProgress >= media.total) {
      finalStatus = "completed";
    }

    const nextEntry: OkamiEntry = {
      id: media.id,
      type: media.type,
      title: media.title,
      cover: media.cover,
      year: media.year,
      format: media.format,
      genres: media.genres,
      official_score: media.official_score,
      user_score: data.userScore,
      status: finalStatus,
      progress: clampedProgress,
      total: media.total ?? null,
      completed_seasons: [],
      completed_volumes: [],
      completed_episodes: Array.from({ length: clampedProgress }, (_, i) => i + 1),
      date_added: entry?.date_added ?? now,
      notes: data.notes,
      is_favourite: entry?.is_favourite ?? false,
    };

    const nextEntries = entry
      ? updateEntry(entries, entry.id, entry.type, nextEntry)
      : addEntry(entries, nextEntry);
    commitEntries(nextEntries);

    // Multi-Select Franchise Bundling into ONE Single Unified Entry
    const primaryOption: FranchiseItemOption = {
      id: media.id,
      title: media.title,
      type: media.type,
      format: media.format || (media.type === "manga" ? "Manga" : "TV"),
      total: media.total ?? null,
      cover: media.cover,
      relation: "Current Title",
      isCurrent: true,
    };

    const selectedOptions =
      data.selectedFranchiseItems && data.selectedFranchiseItems.length > 0
        ? data.selectedFranchiseItems
        : [primaryOption];

    const { updatedFranchises, franchiseId } = bundleFranchiseEntries(
      franchises,
      primaryOption,
      selectedOptions,
      clampedProgress,
      finalStatus,
      data.userScore,
      data.notes
    );

    // If specific seasons were marked completed in data.completedSeasons:
    if (data.completedSeasons.length > 0 && updatedFranchises[franchiseId]?.anime?.seasons) {
      const animeSeasons = { ...updatedFranchises[franchiseId].anime!.seasons };
      for (const sId of data.completedSeasons) {
        if (animeSeasons[sId]) {
          animeSeasons[sId] = {
            ...animeSeasons[sId],
            status: "COMPLETED",
            completedAt: Date.now(),
          };
        }
      }
      updatedFranchises[franchiseId] = {
        ...updatedFranchises[franchiseId],
        anime: {
          ...updatedFranchises[franchiseId].anime!,
          seasons: animeSeasons,
        },
      };
    }

    commitFranchises(updatedFranchises);

    // Append to Mihon append-only history log
    appendHistory({
      franchiseId,
      malId: media.id,
      mediaType: media.type,
      title: media.title,
      coverImage: media.cover,
      number: clampedProgress,
      timestamp: Date.now(),
    });

    setModalState(null);
    showToast(entry ? `Updated "${media.title}"` : `Added "${media.title}" to Library`);
  };

  const handleRemoveEntry = (entry: OkamiEntry) => {
    commitEntries(removeEntry(entries, entry.id, entry.type));
    showToast(`Removed "${entry.title}" from Library`, "info");
  };

  const handleToggleFavourite = (entry: OkamiEntry) => {
    commitEntries(toggleFavourite(entries, entry.id, entry.type));
    showToast(entry.is_favourite ? `Removed from favourites` : `Added "${entry.title}" to favourites`);
  };

  const openDetailById = async (type: MediaType, id: number) => {
    setDetailLoading(true);
    try {
      const detail = await fetchDetail(type, id);
      setDetailMedia(detail);
    } catch {
      setDetailMedia(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openAddById = async (type: MediaType, id: number) => {
    try {
      const detail = await fetchDetail(type, id);
      setModalState({ media: detail, entry: entryMap.get(mediaKey(detail)) });
    } catch {
      setModalState(null);
    }
  };

  const openInfo = (media: OkamiMedia) => {
    if (media.type === "anime") {
      router.push(`/anime/${media.id}/info`);
    } else {
      router.push(`/manga/${media.id}/info`);
    }
  };

  const openTracker = (item: UnifiedLibraryItem) => {
    if (item.type === "manga") {
      router.push(`/manga/${item.activeMalId}`);
    } else {
      router.push(`/anime/${item.activeMalId}`);
    }
  };

  const handleExport = () => {
    const json = exportLibraryAsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `okami-backup-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const success = importLibraryFromJson(text);
        if (success) {
          setEntries(loadEntries());
          setFranchises(loadFranchiseEntries());
          alert("Vault backup successfully imported.");
        } else {
          alert("Invalid backup file format.");
        }
      } catch {
        alert("Failed to parse JSON backup.");
      }
    };
    input.click();
  };

  const handleImportMAL = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,.json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = importFromMAL(text);
        if (res.importedCount > 0) {
          setEntries(loadEntries());
          setFranchises(loadFranchiseEntries());
          alert(`Successfully imported ${res.importedCount} titles from MyAnimeList!`);
        } else {
          alert(`No valid titles could be imported. ${res.errors.join("; ")}`);
        }
      } catch (err) {
        alert(`Failed to import MAL backup: ${err}`);
      }
    };
    input.click();
  };

  const handleImportAniList = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = importFromAniList(text);
        if (res.importedCount > 0) {
          setEntries(loadEntries());
          setFranchises(loadFranchiseEntries());
          alert(`Successfully imported ${res.importedCount} titles from AniList!`);
        } else {
          alert(`No valid titles could be imported. ${res.errors.join("; ")}`);
        }
      } catch (err) {
        alert(`Failed to import AniList backup: ${err}`);
      }
    };
    input.click();
  };

  const handleClear = () => {
    if (confirm("This will permanently delete all your tracked entries and franchise progress. Are you sure?")) {
      if (confirm("Second confirmation: This action is permanent and cannot be undone.")) {
        commitEntries([]);
        commitFranchises({});
      }
    }
  };

  const clearLibraryFilters = () => {
    setActiveType(activeTab.toLowerCase() === "manga" ? "manga" : "anime");
    setActiveGenre("");
    setActiveStatus("");
  };

  return (
    <div className={`app ${activeTab === "Manga" ? "theme-manga" : "theme-anime"}`}>
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-text">ŌKAMI</div>
          <div className="logo-sub">{activeTab === "Manga" ? "MANGA ARCHIVE" : "Digital Vault"}</div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              onClick={() => setActiveNav(item.label)}
              aria-pressed={activeNav === item.label}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="log-btn" type="button" onClick={() => setLogProgressOpen(true)}>
            + Log Progress
          </button>
        </div>
      </aside>

      <main className={`main ${activeTab === "Manga" ? "theme-manga" : "theme-anime"}`}>
        <div className="topbar">
          {["Anime", "Manga"].map((tab) => (
            <button
              key={tab}
              className={`topbar-tab ${tab === "Manga" ? "manga-tab" : "anime-tab"} ${activeTab === tab ? "active" : ""}`}
              type="button"
              onClick={() => handleTabChange(tab)}
              aria-pressed={activeTab === tab}
            >
              {tab}
            </button>
          ))}
          <div className="topbar-right">
            <button
              className="topbar-icon"
              type="button"
              aria-label="Search"
              onClick={() => setActiveNav("Explore")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button
              className="avatar"
              type="button"
              aria-label="Profile"
              onClick={() => setActiveNav("Profile")}
            >
              ŌK
            </button>
          </div>
        </div>

        <div className={`content content-area-bg ${viewClass}`}>
          <div className="content-inner">
            <div key={activeNav} className="view-panel">
              {activeNav === "Library" ? (
                <LibraryView
                  entries={entries}
                  franchises={franchises}
                  onQuickIncrement={handleQuickIncrement}
                  activeView={activeView}
                  setActiveView={setActiveView}
                  activeType={activeType}
                  activeGenre={activeGenre}
                  activeStatus={activeStatus}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  onDetail={openInfo}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onExplore={() => setActiveNav("Explore")}
                  onClearFilters={clearLibraryFilters}
                  onOpenTracker={openTracker}
                  onOpenFolder={setOpenFolderItem}
                />
              ) : null}
              {activeNav === "Explore" ? (
                <ExploreView
                  activeType={activeTab.toLowerCase() === "manga" ? "manga" : "anime"}
                  onTypeChange={(type) => {
                    handleTabChange(type === "manga" ? "Manga" : "Anime");
                  }}
                  entryMap={entryMap}
                  entries={entries}
                  franchises={franchises}
                  onCommitEntries={commitEntries}
                  onCommitFranchises={commitFranchises}
                  onAdd={(media) => setModalState({ media })}
                  onDetail={openInfo}
                />
              ) : null}
              {activeNav === "My List" ? (
                <MyListView
                  entries={entries}
                  franchises={franchises}
                  activeType={activeTab.toLowerCase() === "manga" ? "manga" : "anime"}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onCommitEntries={commitEntries}
                  onCommitFranchises={commitFranchises}
                  onOpenTracker={openTracker}
                  onOpenFolder={setOpenFolderItem}
                  onExplore={() => setActiveNav("Explore")}
                />
              ) : null}
              {activeNav === "Profile" ? (
                <ProfileView
                  profileStats={profileStats}
                  favourites={favourites}
                  onExport={handleExport}
                  onImport={handleImport}
                  onImportMAL={handleImportMAL}
                  onImportAniList={handleImportAniList}
                  onClear={handleClear}
                />
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {modalState ? (
        <AddEntryModal
          key={`${modalState.media.id}-${modalState.entry?.date_added ?? "new"}`}
          state={modalState}
          onClose={() => setModalState(null)}
          onSave={handleSaveEntry}
        />
      ) : null}
      {logProgressOpen ? (
        <LogProgressModal entries={entries} onCommit={commitEntries} onClose={() => setLogProgressOpen(false)} />
      ) : null}
      {openFolderItem ? (
        <FolderModal
          item={openFolderItem}
          franchises={franchises}
          onCommitFranchises={(updated) => {
            commitFranchises(updated);
            const freshUnified = buildUnifiedLibraryItems(updated, entries);
            const found = freshUnified.find((u) => u.id === openFolderItem.id);
            if (found) setOpenFolderItem(found);
          }}
          onClose={() => setOpenFolderItem(null)}
          onOpenTracker={openTracker}
          onDetail={openInfo}
        />
      ) : null}
      {detailMedia ? (
        <DetailPanel
          key={`${detailMedia.id}-${detailMedia.type}`}
          media={detailMedia}
          loading={detailLoading}
          inLibrary={entryMap.has(mediaKey(detailMedia))}
          entryMap={entryMap}
          onClose={() => setDetailMedia(null)}
          onAdd={() => setModalState({ media: detailMedia, entry: entryMap.get(mediaKey(detailMedia)) })}
          onSelectRelated={openDetailById}
          onAddRelated={openAddById}
        />
      ) : null}
      <Toast toast={toastMessage} />
    </div>
  );
}
