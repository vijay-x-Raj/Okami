"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { JikanEpisode, JikanRelation, MangaVolumeItem, MediaType, OkamiMedia } from "./lib/jikan";
import { formatMediaNumberDisplay } from "./lib/jikan";
import { fetchDetail, fetchEpisodes, fetchFranchiseGraph, fetchRelated, fetchSeason, fetchSeasonDetailed, fetchTop, fetchTopDetailed, fetchVolumes, searchMedia } from "./lib/api";
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
  bundleFranchiseEntries,
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

function statusLabel(status: OkamiStatus) {
  const match = statusOptions.find((option) => option.value === status);
  return match?.label ?? "Plan to Watch / Read";
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
  type: "anime" | "manga" | "both";
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
}

function buildUnifiedLibraryItems(
  franchises: Record<string, UnifiedFranchiseEntry>,
  entries: OkamiEntry[]
): UnifiedLibraryItem[] {
  const items: UnifiedLibraryItem[] = [];
  const seenRoots = new Set<number>();

  for (const franchise of Object.values(franchises)) {
    seenRoots.add(franchise.rootMalId);
    if (Array.isArray(franchise.linkedMalIds)) {
      franchise.linkedMalIds.forEach((id) => seenRoots.add(id));
    }
    if (franchise.anime?.seasons) {
      Object.keys(franchise.anime.seasons).forEach((id) => seenRoots.add(Number(id)));
    }
    if (franchise.manga?.series) {
      Object.keys(franchise.manga.series).forEach((id) => seenRoots.add(Number(id)));
    }
    const displayInfo = getFranchiseDisplayInfo(franchise);

    const activeMalId =
      displayInfo.mediaType === "manga"
        ? (displayInfo.activeMangaMalId || franchise.rootMalId)
        : (displayInfo.activeSeasonMalId || franchise.rootMalId);

    const matchingEntry = entries.find(
      (e) =>
        e.id === activeMalId ||
        e.id === franchise.rootMalId ||
        (Array.isArray(franchise.linkedMalIds) && franchise.linkedMalIds.includes(e.id))
    );

    const franchiseSeason =
      displayInfo.mediaType === "manga"
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

    items.push({
      id: franchise.franchiseId,
      rootMalId: franchise.rootMalId,
      activeMalId,
      title: franchise.title,
      cover: franchise.coverImage,
      type: displayInfo.mediaType,
      format: matchingEntry?.format || (displayInfo.mediaType === "manga" ? "Manga" : "TV Series"),
      year: matchingEntry?.year || 0,
      genres: franchise.genres?.length ? franchise.genres : matchingEntry?.genres || [],
      official_score: resolvedOfficialScore,
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
    });
  }

  for (const entry of entries) {
    if (seenRoots.has(entry.id)) continue;
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
  onClick,
}: {
  label: string;
  state?: TriState;
  onClick: () => void;
}) {
  const icon = state === "include" ? "✓ " : state === "exclude" ? "✕ " : "";
  return (
    <button
      type="button"
      className={`tri-state-chip state-${state}`}
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
}: {
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
  onQuickIncrement: (item: UnifiedLibraryItem) => void;
  activeView: "grid" | "list";
  setActiveView: (value: "grid" | "list") => void;
  activeType: "all" | "anime" | "manga" | "films";
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
}) {
  // Mihon state filters: tri-state chips
  const [statusTriState, setStatusTriState] = useState<Record<string, TriState>>({});
  const [typeTriState, setTypeTriState] = useState<Record<string, TriState>>({});
  const [unwatchedTriState, setUnwatchedTriState] = useState<TriState>("neutral");
  const [numberingMode, setNumberingMode] = useState<"relative" | "absolute">("relative");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [categories, setCategories] = useState<CustomCategory[]>(() => loadCustomCategories());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

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

  const displayedItems = useMemo(() => {
    let result = [...unifiedItems];

    // 1. Custom Category filter
    if (activeCategory !== "all") {
      result = result.filter((item) =>
        item.categories?.includes(activeCategory)
      );
    }

    // 2. Type Filter (Tri-State support)
    const hasTypeInclude = Object.values(typeTriState).some((s) => s === "include");
    const hasTypeExclude = Object.values(typeTriState).some((s) => s === "exclude");
    if (hasTypeInclude || hasTypeExclude) {
      result = result.filter((item) => {
        const itemType = item.type;
        const isFilm =
          (item.format?.toLowerCase() || "").includes("film") ||
          (item.format?.toLowerCase() || "").includes("movie");

        if (typeTriState["anime"] === "exclude" && (itemType === "anime" || itemType === "both")) return false;
        if (typeTriState["manga"] === "exclude" && (itemType === "manga" || itemType === "both")) return false;
        if (typeTriState["films"] === "exclude" && isFilm) return false;

        if (hasTypeInclude) {
          if (typeTriState["anime"] === "include" && (itemType === "anime" || itemType === "both")) return true;
          if (typeTriState["manga"] === "include" && (itemType === "manga" || itemType === "both")) return true;
          if (typeTriState["films"] === "include" && isFilm) return true;
          return false;
        }
        return true;
      });
    } else if (activeType !== "all") {
      if (activeType === "films") {
        result = result.filter((item) => {
          const fmt = item.format?.toLowerCase?.() ?? "";
          return fmt.includes("film") || fmt.includes("movie");
        });
      } else {
        result = result.filter((item) => item.type === activeType || item.type === "both");
      }
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

      {/* ── Mihon-Inspired Statistics Summary Cards ── */}
      <div className="stats-summary-grid">
        <div className="stats-summary-card">
          <span className="stats-card-label">Episodes Watched</span>
          <span className="stats-card-value">{stats.totalEpisodes.toLocaleString()}</span>
          <span className="stats-card-sub">≈ {stats.daysWatched} Days Total</span>
        </div>
        <div className="stats-summary-card">
          <span className="stats-card-label">Chapters Read</span>
          <span className="stats-card-value">{stats.totalChapters.toLocaleString()}</span>
          <span className="stats-card-sub">{stats.totalVolumes} Volumes Tracked</span>
        </div>
        <div className="stats-summary-card">
          <span className="stats-card-label">Mean Rating</span>
          <span className="stats-card-value">{stats.meanScore > 0 ? stats.meanScore.toFixed(1) : "--"}</span>
          <span className="stats-card-sub">Across All Tracks</span>
        </div>
        <div className="stats-summary-card">
          <span className="stats-card-label">Completed Titles</span>
          <span className="stats-card-value">{stats.completedAnime + stats.completedManga}</span>
          <span className="stats-card-sub">{stats.completedAnime} Anime • {stats.completedManga} Manga</span>
        </div>
      </div>

      {/* ── Recently Watched / Read Activity Shelf ── */}
      {history.length > 0 && (
        <section className="recent-activity-section">
          <div className="recent-activity-header">
            <div className="recent-activity-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Recent Activity / 最近の履歴</span>
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
            {history.slice(0, 8).map((h) => (
              <div
                key={h.id}
                className="recent-activity-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  const targetItem = unifiedItems.find(
                    (it) => it.id === h.franchiseId || it.rootMalId === h.malId
                  );
                  if (targetItem) onOpenTracker(targetItem);
                }}
              >
                {h.coverImage && (
                  <img className="activity-card-thumb" src={h.coverImage} alt={h.title} />
                )}
                <div className="activity-card-info">
                  <div className="activity-card-title">{h.title}</div>
                  <div className="activity-card-meta">
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

        {/* Media Type Tri-State */}
        <div className="filter-section" style={{ gap: "6px" }}>
          <span className="filter-label">Type</span>
          {[
            { label: "Anime", value: "anime" },
            { label: "Manga", value: "manga" },
            { label: "Films", value: "films" },
          ].map((item) => (
            <TriStateFilterChip
              key={item.value}
              label={item.label}
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
              <article className="card" key={item.id}>
                <div
                  className="card-img-wrap"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenTracker(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenTracker(item);
                    }
                  }}
                >
                  <img className="card-img" src={item.cover} alt={item.title} />
                  <div className="franchise-pointer-badge">{formattedProgress}</div>
                  <div className="card-img-overlay" />

                  {/* Mihon Unwatched / Unread Badge Pill */}
                  {item.unwatchedCount > 0 ? (
                    <div className="unwatched-badge">
                      {item.unwatchedCount} {isManga ? "Ch" : "Ep"} left
                    </div>
                  ) : item.unreadCount > 0 ? (
                    <div className="unwatched-badge">
                      {item.unreadCount} Ch left
                    </div>
                  ) : null}

                  <div className="card-actions">
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
                    <button
                      className="card-action-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
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
                      }}
                    >
                      Update
                    </button>
                    <button
                      className="card-action-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
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
                      }}
                    >
                      Info
                    </button>
                  </div>
                  <div className={`score-badge ${item.official_score >= 8.5 ? "gold" : ""}`}>
                    {formatScore(item.official_score)}
                  </div>
                  <div className={`status-badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</div>
                </div>
                <div className="card-info">
                  <Link
                    className="card-title"
                    href={isManga ? `/manga/${item.activeMalId}/info` : `/anime/${item.activeMalId}/info`}
                  >
                    {item.title}
                  </Link>
                  <div className="card-meta">
                    <span className={`type-chip ${category.className}`}>{category.label}</span>
                    <span className="meta-dot">•</span>
                    <span>{item.year || "--"}</span>
                    <span className="meta-dot">•</span>
                    <span>{item.format}</span>
                    {item.franchise &&
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
                <Link
                  aria-label={`Open tracker for ${item.title}`}
                  href={isManga ? `/manga/${item.activeMalId}` : `/anime/${item.activeMalId}`}
                >
                  <img className="row-cover" src={item.cover} alt={item.title} />
                </Link>
                <Link
                  className="title-cell"
                  href={isManga ? `/manga/${item.activeMalId}/info` : `/anime/${item.activeMalId}/info`}
                >
                  {item.title}
                </Link>
                <span className={`type-chip ${category.className}`}>{category.label}</span>
                <span className="mono">{item.user_score ?? "--"}</span>
                <span className="mono">{formatScore(item.official_score)}</span>
                <span className={`status-chip ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                <span className="mono">{item.progressLabel}</span>
                <span className="mono" style={{ color: unplayedCount > 0 ? "var(--accent)" : "var(--text-3)" }}>
                  {unplayedCount > 0 ? `+${unplayedCount}` : "0"}
                </span>
                <div>
                  <button
                    className="card-action-btn quick-plus"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    type="button"
                    onClick={() => onQuickIncrement(item)}
                  >
                    +1 {isManga ? "Ch" : "Ep"}
                  </button>
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

const QUICK_TAGS_ANIME = [
  "Frieren",
  "Attack on Titan",
  "Solo Leveling",
  "Jujutsu Kaisen",
  "Demon Slayer",
  "Chainsaw Man",
  "Cyberpunk",
  "Action",
  "Sci-Fi",
  "Romance",
];

const QUICK_TAGS_MANGA = [
  "Berserk",
  "One Piece",
  "Vagabond",
  "Vinland Saga",
  "Solo Leveling",
  "Chainsaw Man",
  "Tokyo Ghoul",
  "Action",
  "Dark Fantasy",
  "Seinen",
];

// ── Unified Explore Card Component ──
function ExploreMediaCard({
  media,
  entryMap,
  onAdd,
  onDetail,
  index,
}: {
  media: OkamiMedia;
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
  index?: number;
}) {
  const inLibrary = entryMap.has(mediaKey(media));
  const isAnime = media.type === "anime";
  const infoUrl = isAnime ? `/anime/${media.id}/info` : `/manga/${media.id}/info`;
  const isHighScoring = media.official_score >= 8.5;
  const category = entryCategory(media.type, media.format);

  return (
    <article className="card" key={mediaKey(media)}>
      <div
        className="card-img-wrap"
        role="button"
        tabIndex={0}
        onClick={() => onDetail(media)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onDetail(media);
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
  categoryType: "season" | "top" | "top-filter" | "genre";
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
}: {
  category: ExploreCategoryConfig;
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
  onBack: () => void;
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

        if (category.categoryType === "season") {
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

// ─── 2. Explore View (Unified Theme) ───

function ExploreView({
  entryMap,
  onAdd,
  onDetail,
}: {
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
}) {
  const [activeType, setActiveType] = useState<MediaType>("anime");
  const [query, setQuery] = useState("");
  const [activeSort, setActiveSort] = useState<"trending" | "score" | "popular" | "newest" | "title">("trending");
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeFormat, setActiveFormat] = useState("");
  const [activeSeason, setActiveSeason] = useState("");
  const [activeStatus, setActiveStatus] = useState("");

  const [activeCategoryView, setActiveCategoryView] = useState<ExploreCategoryConfig | null>(null);
  const [loadingBatchCategory, setLoadingBatchCategory] = useState<string | null>(null);

  const [results, setResults] = useState<OkamiMedia[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
      setLoadingTop(true);
      setTopError(false);
    });

    Promise.all([
      // Anime categories (up to 50 items each)
      fetchSeason({ limit: 50 }).catch(() => []),
      fetchTop("anime", { limit: 50 }).catch(() => []),
      fetchTop("anime", { filter: "movie", limit: 50 }).catch(() => []),
      searchMedia("anime", "", { genres: "Action", limit: 50 }).then(r => r.data).catch(() => []),
      searchMedia("anime", "", { genres: "Psychological", limit: 50 }).then(r => r.data).catch(() => []),

      // Manga categories (up to 50 items each)
      fetchTop("manga", { limit: 50 }).catch(() => []),
      fetchTop("manga", { filter: "novels", limit: 50 }).catch(() => []),
      searchMedia("manga", "", { genres: "Action", limit: 50 }).then(r => r.data).catch(() => []),
      searchMedia("manga", "", { genres: "Romance", limit: 50 }).then(r => r.data).catch(() => []),
    ])
      .then(([seasonData, animeData, movieData, actAnimeData, psychData, mangaData, novelData, actMangaData, romMangaData]) => {
        if (!active) return;
        setSeasonal(seasonData);
        setTopAnime(animeData);
        setTopMovies(movieData);
        setActionAnime(actAnimeData);
        setPsychAnime(psychData);

        setTopManga(mangaData);
        setTopNovels(novelData);
        setActionManga(actMangaData);
        setRomanceManga(romMangaData);

        if (seasonData.length === 0 && animeData.length === 0 && mangaData.length === 0) {
          setTopError(true);
        }
      })
      .catch(() => {
        if (!active) return;
        setTopError(true);
      })
      .finally(() => {
        if (active) setLoadingTop(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadMoreBatches = async (catId: string) => {
    if (loadingBatchCategory) return;
    setLoadingBatchCategory(catId);
    try {
      if (catId === "seasonal") {
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

  const handleQuickTagClick = (tag: string) => {
    if ((EXPLORE_GENRES as readonly string[]).includes(tag)) {
      setActiveGenres((prev) =>
        prev.includes(tag) ? prev.filter((g) => g !== tag) : [...prev, tag]
      );
    } else {
      setQuery(tag);
    }
  };

  const isAnime = activeType === "anime";
  const quickTags = isAnime ? QUICK_TAGS_ANIME : QUICK_TAGS_MANGA;
  const formatOptions = isAnime ? ANIME_FORMATS : MANGA_FORMATS;

  // Curate 5 top spotlight items for the full-width interactive slider
  const spotlights = useMemo(() => {
    if (isAnime) {
      const list = [...seasonal.slice(0, 3), ...topAnime.slice(0, 2)];
      return list.length ? list : topAnime.slice(0, 5);
    }
    const list = [...topManga.slice(0, 4), ...topNovels.slice(0, 1)];
    return list.length ? list : topManga.slice(0, 5);
  }, [isAnime, seasonal, topAnime, topManga, topNovels]);

  const countActiveFilters =
    (debouncedQuery.trim() ? 1 : 0) +
    activeGenres.length +
    (activeSeason ? 1 : 0) +
    (activeFormat ? 1 : 0) +
    (activeStatus ? 1 : 0) +
    (activeSort !== "trending" ? 1 : 0);

  return (
    <div className="explore-view">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">探索</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">EXPLORE</span>
          <div className="view-toggle" style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
            <button
              type="button"
              className={`pill pill-type type-anime ${activeType === "anime" ? "active" : ""}`}
              onClick={() => {
                setActiveType("anime");
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
                setActiveType("manga");
                setActiveFormat("");
                setActiveCategoryView(null);
              }}
            >
              Manga Catalog
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

      {/* ── Trending Quick Chips ── */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
        <span className="filter-label" style={{ marginRight: "4px" }}>Trending:</span>
        {quickTags.map((tag) => {
          const isActive = query.toLowerCase() === tag.toLowerCase() || activeGenres.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`pill ${isActive ? "active" : ""}`}
              onClick={() => handleQuickTagClick(tag)}
            >
              {tag}
            </button>
          );
        })}
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
                {/* Category 01: Top Airing Releases */}
                <ExploreCategorySection
                  title="Current Airing Broadcasts"
                  items={seasonal}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
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

                {/* Category 02: All-Time Masterpieces */}
                <ExploreCategorySection
                  title="All-Time Titans & Masterpieces"
                  items={topAnime}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
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
                {/* Category 01: Top-Tier Manga Classics */}
                <ExploreCategorySection
                  title="Top-Tier Manga Masterpieces"
                  items={topManga}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
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
    </div>
  );
}

// ─── 3. My List View ───

function MyListView({
  entries,
  franchises,
  onEdit,
  onRemove,
  onToggleFavourite,
  onCommitEntries,
  onCommitFranchises,
  onOpenTracker,
  onExplore,
}: {
  entries: OkamiEntry[];
  franchises: Record<string, UnifiedFranchiseEntry>;
  onEdit: (entry: OkamiEntry) => void;
  onRemove: (entry: OkamiEntry) => void;
  onToggleFavourite: (entry: OkamiEntry) => void;
  onCommitEntries: (next: OkamiEntry[]) => void;
  onCommitFranchises: (next: Record<string, UnifiedFranchiseEntry>) => void;
  onOpenTracker: (item: UnifiedLibraryItem) => void;
  onExplore: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>("All");
  const [activeType, setActiveType] = useState<"all" | "anime" | "manga">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"index" | "title" | "user_score" | "official_score" | "status" | "progress" | "date_added">("date_added");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [editingProgressKey, setEditingProgressKey] = useState<string | null>(null);
  const [editingProgressVal, setEditingProgressVal] = useState<number>(0);

  // Build unified items from both franchises and standalone entries
  const unifiedItems = useMemo(
    () => buildUnifiedLibraryItems(franchises, entries),
    [franchises, entries]
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
    { key: "watching", label: "Watching / Reading", count: tabCounts.watching },
    { key: "completed", label: "Completed", count: tabCounts.completed },
    { key: "on_hold", label: "On Hold", count: tabCounts.on_hold },
    { key: "dropped", label: "Dropped", count: tabCounts.dropped },
    { key: "plan_to_watch", label: "Plan to Watch / Read", count: tabCounts.plan },
    { key: "favourites", label: "Favourites", count: tabCounts.favourites },
  ];

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    let list = [...unifiedItems];

    if (activeType === "anime") {
      list = list.filter((item) => item.type === "anime");
    } else if (activeType === "manga") {
      list = list.filter((item) => item.type === "manga");
    }

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

        <div className="mylist-type-pills">
          {(["all", "anime", "manga"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`mylist-type-pill ${activeType === t ? "active" : ""}`}
              onClick={() => setActiveType(t)}
            >
              {t === "all" ? "All Media" : t === "anime" ? "Anime Only" : "Manga Only"}
            </button>
          ))}
        </div>

        <div className="mylist-count-badge">
          Showing {filteredItems.length} of {unifiedItems.length}
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
                  setActiveType("all");
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
                  onClick={() => onOpenTracker(item)}
                  title="Open dedicated media tracker"
                >
                  <img className="mylist-cover-thumb" src={item.cover} alt={item.title} />
                </button>

                {/* 3. Title */}
                <div className="mylist-title-group">
                  <button
                    type="button"
                    className="mylist-title-link"
                    style={{ background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                    onClick={() => onOpenTracker(item)}
                    title={item.title}
                  >
                    {item.title}
                  </button>
                  <div className="mylist-title-meta">
                    <span>{item.format || (item.type === "manga" ? "Manga" : "TV")}</span>
                    {item.year ? <span>• {item.year}</span> : null}
                    {item.genres?.length ? <span>• {item.genres.slice(0, 2).join(", ")}</span> : null}
                  </div>
                </div>

                {/* 4. Format chip */}
                <div style={{ textAlign: "center" }}>
                  <span className={`type-chip ${category.className}`}>{category.label}</span>
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
                    title={`Official MyAnimeList Rating: ${item.official_score ? item.official_score.toFixed(2) : "Unrated"}`}
                  >
                    {item.official_score && item.official_score > 0 ? item.official_score.toFixed(1) : "--"}
                  </span>
                </div>

                {/* 7. Interactive Status Select */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <select
                    className={`status-chip ${statusClass(item.status)}`}
                    style={{ cursor: "pointer", border: "none", outline: "none" }}
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

                {/* 8. Progress Stepper: [-1] [input / label] [+1] */}
                <div style={{ display: "flex", justifyContent: "center" }}>
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

                  {/* Open Tracker Link */}
                  <button
                    type="button"
                    className="mylist-icon-btn"
                    onClick={() => onOpenTracker(item)}
                    title="Open Tracker"
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
                    onClick={() => onEdit(getItemEntry(item))}
                    title="Edit full entry details"
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

// ─── 4. Profile & Data Management View ───

function ProfileView({
  profileStats,
  favourites,
  onExport,
  onImport,
  onImportMAL,
  onImportAniList,
  onClear,
}: {
  profileStats: Array<{ label: string; value: string }>;
  favourites: OkamiEntry[];
  onExport: () => void;
  onImport: () => void;
  onImportMAL?: () => void;
  onImportAniList?: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">記録</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">PROFILE</span>
        </div>
        <div className="page-sub">Analytics, backups, and vault controls</div>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-avatar">ŌK</div>
            <div>
              <div className="profile-name">Okami Master</div>
              <div className="profile-join">Tracking Vault • Active</div>
            </div>
          </div>
          <div className="profile-stats">
            {profileStats.map((stat) => (
              <div className="profile-stat" key={stat.label}>
                <span className="profile-stat-value">{stat.value}</span>
                <span className="profile-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="section-header">
            <span className="section-title">Favourite Titles</span>
          </div>
          <div className="favourite-row">
            {favourites.length === 0 ? (
              <div className="empty-inline">No favourites marked yet. Star titles from Library or My List.</div>
            ) : (
              favourites.slice(0, 6).map((entry) => (
                <div className="favourite-card" key={entryKey(entry)}>
                  <Link href={entry.type === "anime" ? `/anime/${entry.id}` : `/manga/${entry.id}`}>
                    <img className="favourite-cover" src={entry.cover} alt={entry.title} />
                  </Link>
                  <span className="favourite-title">{entry.title}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="profile-card settings-card">
          <div className="section-header">
            <span className="section-title">Vault Data Management (Mihon Port)</span>
          </div>
          <div className="settings-list">
            <button className="settings-btn" type="button" onClick={onExport}>
              Export Vault Backup (JSON v3)
            </button>
            <button className="settings-btn" type="button" onClick={onImport}>
              Import Vault Backup (JSON)
            </button>
            {onImportMAL && (
              <button className="settings-btn" type="button" onClick={onImportMAL}>
                Import from MyAnimeList (XML / JSON)
              </button>
            )}
            {onImportAniList && (
              <button className="settings-btn" type="button" onClick={onImportAniList}>
                Import from AniList (JSON)
              </button>
            )}
            <button className="settings-btn danger" type="button" onClick={onClear}>
              Clear All Vault Data
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal Dialogs ───

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
  const unitSingular = isManga ? "Chapter" : "Episode";

  const [progress, setProgress] = useState<number>(() => Math.max(0, entry?.progress ?? 0));
  const [status, setStatus] = useState<OkamiStatus>(() => entry?.status ?? "plan_to_watch");
  const [userScore, setUserScore] = useState<number | null>(() => entry?.user_score ?? null);
  const [notes, setNotes] = useState(() => entry?.notes ?? "");
  const [inputVal, setInputVal] = useState<string>(() => String(entry?.progress ?? 0));

  // Multi-Select Franchise State
  const [franchiseOptions, setFranchiseOptions] = useState<FranchiseItemOption[]>([]);
  const [loadingFranchise, setLoadingFranchise] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(media ? [media.id] : []));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Load Franchise Relations for Multiselect
  useEffect(() => {
    if (!media) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoadingFranchise(true);
    });

    async function loadFranchise() {
      if (!media) return;
      try {
        const graph = await fetchFranchiseGraph(media.id, media.type).catch(() => null);
        if (!active) return;

        const options: FranchiseItemOption[] = [];
        const seen = new Set<number>();

        // Always include current media first
        const currentOpt: FranchiseItemOption = {
          id: media.id,
          title: media.title,
          type: media.type,
          format: media.format || (media.type === "manga" ? "Manga" : "TV"),
          total: media.total ?? null,
          cover: media.cover,
          relation: "Current Selection",
          isCurrent: true,
        };
        options.push(currentOpt);
        seen.add(media.id);

        if (graph) {
          if (Array.isArray(graph.seasons)) {
            for (const s of graph.seasons) {
              if (!seen.has(s.malId)) {
                seen.add(s.malId);
                options.push({
                  id: s.malId,
                  title: s.title,
                  type: "anime",
                  format: s.type || "TV",
                  seasonNumber: s.seasonNumber,
                  total: s.episodes || null,
                  cover: s.cover || media.cover,
                  relation: `Season ${s.seasonNumber}`,
                });
              }
            }
          }
          if (Array.isArray(graph.extras)) {
            for (const e of graph.extras) {
              if (!seen.has(e.malId)) {
                seen.add(e.malId);
                options.push({
                  id: e.malId,
                  title: e.title,
                  type: "anime",
                  format: e.type || "Movie",
                  total: e.episodes || null,
                  cover: e.cover || media.cover,
                  relation: e.type || "Special",
                });
              }
            }
          }
          if (Array.isArray(graph.adaptations)) {
            for (const a of graph.adaptations) {
              if (!seen.has(a.malId)) {
                seen.add(a.malId);
                options.push({
                  id: a.malId,
                  title: a.title,
                  type: "manga",
                  format: a.type || "Manga",
                  total: a.chapters || null,
                  cover: a.cover || media.cover,
                  relation: a.type || "Adaptation",
                });
              }
            }
          }
        }

        if (options.length <= 1) {
          try {
            const relatedList = await fetchRelated(media.type, media.id).catch(() => []);
            if (active && Array.isArray(relatedList)) {
              for (const rel of relatedList) {
                const relName = rel.relation || "Related";
                for (const item of rel.entry || []) {
                  if (!seen.has(item.mal_id)) {
                    seen.add(item.mal_id);
                    options.push({
                      id: item.mal_id,
                      title: item.name || "Untitled",
                      type: item.type === "manga" ? "manga" : "anime",
                      format: item.type === "manga" ? "Manga" : "Anime",
                      total: null,
                      cover: media.cover,
                      relation: relName,
                    });
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        }

        if (active) {
          setFranchiseOptions(options);

          // Check if already in an existing franchise to preselect linked IDs
          const existing = findFranchiseByMalId(loadFranchiseEntries(), media.id);
          if (existing && Array.isArray(existing.linkedMalIds) && existing.linkedMalIds.length > 0) {
            setSelectedIds(new Set([media.id, ...existing.linkedMalIds]));
          } else if (options.length > 1) {
            // Pre-select all main anime seasons by default so multi-seasons are unified seamlessly
            const canonIds = options
              .filter((o) => o.type === media.type && o.seasonNumber !== undefined)
              .map((o) => o.id);
            if (canonIds.length > 0) {
              setSelectedIds(new Set([media.id, ...canonIds]));
            }
          }
        }
      } catch {
        if (active) {
          setFranchiseOptions([
            {
              id: media.id,
              title: media.title,
              type: media.type,
              format: media.format || (media.type === "manga" ? "Manga" : "TV"),
              total: media.total ?? null,
              cover: media.cover,
              relation: "Current Selection",
              isCurrent: true,
            },
          ]);
        }
      } finally {
        if (active) setLoadingFranchise(false);
      }
    }

    loadFranchise();

    return () => {
      active = false;
    };
  }, [media?.id, media?.type, media?.title, media?.format, media?.total, media?.cover]);

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

  const toggleSelectId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (id === media.id && next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(franchiseOptions.map((o) => o.id)));
  };

  const selectCanonOnly = () => {
    const canon = franchiseOptions
      .filter((o) => o.type === media.type && (o.seasonNumber !== undefined || o.id === media.id))
      .map((o) => o.id);
    setSelectedIds(new Set(canon.length > 0 ? canon : [media.id]));
  };

  const selectCurrentOnly = () => {
    setSelectedIds(new Set([media.id]));
  };

  const selectedCount = selectedIds.size;
  const isMultiSeason = franchiseOptions.length > 1;

  return (
    <div className="update-drawer-overlay" onClick={onClose}>
      <aside className="update-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="update-drawer-header">
          <div>
            <div className="update-drawer-eyebrow">{"// OKAMI TRACKER SYSTEM"}</div>
            <h2 className="update-drawer-title">
              {entry ? "UPDATE ENTRY" : "ADD TO LIBRARY"}
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
          {/* 1. Episode / Chapter Tracker Section (No slider, supports infinite/ongoing) */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">
                {isManga ? "01 / CHAPTER TRACKER" : "01 / EPISODE TRACKER"}
              </span>
              <span className={`update-section-badge ${percent === 100 ? "highlight" : ""}`}>
                {total !== null ? `${percent}% COMPLETED` : "ONGOING RELEASE"}
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
                    <span>{remaining} {remaining === 1 ? unitSingular : unit} remaining</span>
                  )
                ) : (
                  <span style={{ color: "var(--gold)" }}>Ongoing Broadcast • No Episode Limit</span>
                )}
              </div>
            </div>

            {/* Static visual meter (only rendered if total is known) */}
            {total !== null && total > 0 && (
              <div className="update-progress-meter-track">
                <div
                  className="update-progress-meter-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}

            {/* Steppers & Direct Input Row */}
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

              {/* Direct Numeric Input with no arbitrary clamp on infinite episodes */}
              <div className="update-direct-input-wrap" title="Directly enter episode/chapter number">
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

            {/* Quick Action Button for one-click increment */}
            <div className="update-quick-step-row">
              <button
                type="button"
                className="update-quick-step-btn"
                onClick={() => handleProgressChange(progress + 1)}
                disabled={total !== null && progress >= total}
              >
                +1 {unitSingular} Watched
              </button>
            </div>
          </div>

          {/* 2. Franchise Multi-Select Section */}
          <div className="update-section multiselect-section">
            <div className="update-section-head">
              <span className="update-section-label">
                02 / FRANCHISE SEASONS (MULTI-SELECT)
              </span>
              <span className="multiselect-count-badge">
                {selectedCount} Selected • 1 Unified Entry
              </span>
            </div>

            <div className="multiselect-toolbar">
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                Selected seasons appear as a single entry in your library:
              </span>
              {isMultiSeason && (
                <div className="multiselect-quick-actions">
                  <button
                    type="button"
                    className="multiselect-quick-btn"
                    onClick={selectAll}
                    title="Select all related entries"
                  >
                    All ({franchiseOptions.length})
                  </button>
                  <button
                    type="button"
                    className="multiselect-quick-btn"
                    onClick={selectCanonOnly}
                    title="Select only canon seasons"
                  >
                    Canon
                  </button>
                  <button
                    type="button"
                    className="multiselect-quick-btn"
                    onClick={selectCurrentOnly}
                    title="Select current only"
                  >
                    Current
                  </button>
                </div>
              )}
            </div>

            {loadingFranchise ? (
              <div style={{ fontSize: 11, color: "var(--text-3)", padding: "10px 0" }}>
                Indexing franchise canon & seasons...
              </div>
            ) : (
              <div className="multiselect-list custom-scroll">
                {franchiseOptions.map((opt) => {
                  const isChecked = selectedIds.has(opt.id);
                  const isCurrent = opt.id === media.id;
                  return (
                    <div
                      key={opt.id}
                      className={`multiselect-item ${isChecked ? "selected" : ""} ${isCurrent ? "current" : ""}`}
                      onClick={() => toggleSelectId(opt.id)}
                    >
                      <input
                        type="checkbox"
                        className="multiselect-checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectId(opt.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <img
                        className="multiselect-thumb"
                        src={opt.cover}
                        alt={opt.title}
                      />
                      <div className="multiselect-info">
                        <div className="multiselect-title" title={opt.title}>
                          {opt.title}
                        </div>
                        <div className="multiselect-meta">
                          <span className={`multiselect-pill ${isCurrent ? "accent" : opt.relation?.includes("Season") ? "gold" : ""}`}>
                            {opt.relation || opt.format}
                          </span>
                          <span>•</span>
                          <span>
                            {opt.total ? `${opt.total} ${opt.type === "manga" ? "chs" : "eps"}` : "Ongoing"}
                          </span>
                          {isCurrent && (
                            <>
                              <span>•</span>
                              <span style={{ color: "var(--accent)", fontWeight: 700 }}>ACTIVE</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Status Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">03 / TRACKING STATUS</span>
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

          {/* 4. Score Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">04 / PERSONAL RATING</span>
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

          {/* 5. Notes Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">05 / PRIVATE MEMO</span>
              <span className="update-section-badge">{notes.length} CHARS</span>
            </div>
            <textarea
              className="update-notes-textarea custom-scroll"
              rows={3}
              placeholder="Add impressions, episode bookmarks, or personal reflections..."
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
                const selectedItems = franchiseOptions.filter((opt) => selectedIds.has(opt.id));
                onSave({
                  status,
                  userScore,
                  notes,
                  progress,
                  completedSeasons: entry?.completed_seasons || [],
                  completedVolumes: entry?.completed_volumes || [],
                  selectedFranchiseItems: selectedItems.length > 0 ? selectedItems : undefined,
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

function LogProgressModal({
  entries,
  onCommit,
  onClose,
}: {
  entries: OkamiEntry[];
  onCommit: (next: OkamiEntry[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OkamiEntry | null>(null);
  const [progress, setProgress] = useState("");

  const filtered = useMemo(() => {
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(query.toLowerCase()) &&
        (e.status === "watching" || e.status === "plan_to_watch")
    );
  }, [entries, query]);

  const handleSelect = (entry: OkamiEntry) => {
    setSelected(entry);
    setProgress(String(entry.progress + 1));
  };

  const handleSave = () => {
    if (!selected) return;
    const val = Number(progress);
    if (!Number.isFinite(val) || val < 0) return;

    const maxTotal = selected.total && selected.total > 0 ? selected.total : Infinity;
    const clamped = Math.min(val, maxTotal);
    const isCompleted = selected.total && clamped >= selected.total;

    onCommit(
      updateEntry(entries, selected.id, selected.type, {
        progress: clamped,
        status: isCompleted ? "completed" : "watching",
      })
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Log Reading / Watching Progress</span>
          <button className="modal-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <input
          className="search-input"
          style={{ width: "100%", marginBottom: 12 }}
          placeholder="Filter your active titles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="log-list custom-scroll" style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 ? (
            <div className="detail-empty">No active titles found.</div>
          ) : (
            filtered.map((item) => (
              <div
                key={entryKey(item)}
                onClick={() => handleSelect(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 8,
                  borderRadius: 4,
                  background: selected?.id === item.id && selected.type === item.type ? "var(--surface-3)" : "var(--surface-2)",
                  border: `1px solid ${selected?.id === item.id && selected.type === item.type ? "var(--accent)" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                <img src={item.cover} alt={item.title} style={{ width: 36, height: 48, objectFit: "cover", borderRadius: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {item.type === "manga" ? "Ch." : "Ep."} {item.progress} / {item.total ?? "?"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div style={{ marginTop: 16 }}>
            <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
              New Progress ({selected.type === "manga" ? "Chapters" : "Episodes"})
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="inline-input"
                type="number"
                min={0}
                max={selected.total ?? 99999}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                style={{ width: 100, fontSize: 14 }}
              />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                / {selected.total ?? "ongoing"}
              </span>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="modal-btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            type="button"
            onClick={handleSave}
            disabled={!selected}
          >
            Save Progress
          </button>
        </div>
      </div>
    </div>
  );
}

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
      <aside className="detail-panel" onClick={(event) => event.stopPropagation()}>
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
              <div className="related-grid">
                {relatedItems.map((item) => {
                  const key = `${item.type}:${item.id}`;
                  const isInLibrary = entryMap.has(key);
                  return (
                    <div className="related-card" key={key}>
                      <div className="related-title">{item.name}</div>
                      <div className="related-meta">{item.relation}</div>
                      <button
                        className={`card-action-btn ${isInLibrary ? "in-library" : "primary"}`}
                        type="button"
                        onClick={() =>
                          isInLibrary ? onSelectRelated(item.type, item.id) : onAddRelated(item.type, item.id)
                        }
                      >
                        {isInLibrary ? "In Library ✓" : "+ Add"}
                      </button>
                    </div>
                  );
                })}
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
  const [activeTab, setActiveTab] = useState("Anime");
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState<"all" | "anime" | "manga" | "films">("all");
  const [activeGenre, setActiveGenre] = useState("");
  const [activeStatus, setActiveStatus] = useState<OkamiStatus | "favorites" | "">("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]>("Last Updated");

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
  }, []);

  const commitEntries = useCallback((next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  }, []);

  const commitFranchises = useCallback((next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  }, []);

  const handleQuickIncrement = useCallback(
    (item: UnifiedLibraryItem) => {
      if (item.franchise) {
        const fId = item.franchise.franchiseId;
        if (item.type === "manga") {
          const mangaId = item.activeMalId;
          const nextFranchises = incrementChapter(franchises, fId, mangaId);
          commitFranchises(nextFranchises);
        } else {
          const seasonId = item.activeMalId;
          const nextFranchises = incrementEpisode(franchises, fId, seasonId);
          commitFranchises(nextFranchises);
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
      }
    },
    [franchises, entries, commitFranchises, commitEntries]
  );

  const [modalState, setModalState] = useState<{ media: OkamiMedia; entry?: OkamiEntry } | null>(null);
  const [detailMedia, setDetailMedia] = useState<OkamiMedia | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logProgressOpen, setLogProgressOpen] = useState(false);

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

    const maxTotal = media.total && media.total > 0 ? media.total : Infinity;
    const clampedProgress = Math.max(0, Math.min(data.progress, maxTotal));

    // Mihon auto-state transitions:
    let finalStatus = data.status;
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
      completed_seasons: data.completedSeasons,
      completed_volumes: data.completedVolumes,
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
  };

  const handleRemoveEntry = (entry: OkamiEntry) => {
    commitEntries(removeEntry(entries, entry.id, entry.type));
  };

  const handleToggleFavourite = (entry: OkamiEntry) => {
    commitEntries(toggleFavourite(entries, entry.id, entry.type));
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
    setActiveType("all");
    setActiveGenre("");
    setActiveStatus("");
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-text">ŌKAMI</div>
          <div className="logo-sub">Digital Vault</div>
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

      <main className="main">
        <div className="topbar">
          {["Anime", "Manga"].map((tab) => (
            <button
              key={tab}
              className={`topbar-tab ${activeTab === tab ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                setActiveType(tab.toLowerCase() as "all" | "anime" | "manga" | "films");
              }}
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
                />
              ) : null}
              {activeNav === "Explore" ? (
                <ExploreView
                  entryMap={entryMap}
                  onAdd={(media) => setModalState({ media })}
                  onDetail={openInfo}
                />
              ) : null}
              {activeNav === "My List" ? (
                <MyListView
                  entries={entries}
                  franchises={franchises}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onCommitEntries={commitEntries}
                  onCommitFranchises={commitFranchises}
                  onOpenTracker={openTracker}
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
    </div>
  );
}
