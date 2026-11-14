"use client";

import { useState, useMemo, useRef, useEffect, type RefObject } from "react";
import Link from "next/link";
import { formatMediaNumberDisplay, type OkamiMedia } from "../lib/jikan";
import {
  type OkamiEntry,
  type OkamiStatus,
  type UnifiedFranchiseEntry,
  type CustomCategory,
  type HistoryEntry,
  loadCustomCategories,
  addCustomCategory,
  loadHistory,
  clearHistory,
  formatRelativeTime,
  TrackManager,
} from "../lib/storage";
import {
  type TriState,
  type UnifiedLibraryItem,
  libraryFilters,
  sortOptions,
  buildUnifiedLibraryItems,
  statusLabel,
  statusClass,
  entryCategory,
  formatScore,
} from "../lib/libraryUtils";
import { prefetchMedia } from "../lib/api";

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

export function EntryMenu({
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

export function TriStateFilterChip({
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

export function LibraryView({
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
