"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  type OkamiEntry,
  type OkamiStatus,
  type UnifiedFranchiseEntry,
  updateMangaProgress,
  bulkWatchEpisodes,
  appendHistory,
  updateEntry,
  addEntry,
} from "../lib/storage";
import {
  type UnifiedLibraryItem,
  buildUnifiedLibraryItems,
  statusClass,
  scoreLabels,
  entryCategory,
} from "../lib/libraryUtils";

// ── Interactive Score Cell & Popover ──
export function MyListScoreCell({
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

// ── Interactive My List Table View ──
export function MyListView({
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
  const [sortField, setSortField] = useState<
    "index" | "title" | "user_score" | "official_score" | "status" | "progress" | "date_added"
  >("date_added");
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
          <button
            type="button"
            className="mylist-th-btn"
            style={{ justifyContent: "center" }}
            onClick={() => handleHeaderClick("user_score")}
            title="Sort by your personal rating"
          >
            My Score {renderSortArrow("user_score")}
          </button>
          <button
            type="button"
            className="mylist-th-btn"
            style={{ justifyContent: "center" }}
            onClick={() => handleHeaderClick("official_score")}
            title="Sort by official MAL rating"
          >
            MAL Score {renderSortArrow("official_score")}
          </button>
          <button
            type="button"
            className="mylist-th-btn"
            style={{ justifyContent: "center" }}
            onClick={() => handleHeaderClick("status")}
          >
            Status {renderSortArrow("status")}
          </button>
          <button
            type="button"
            className="mylist-th-btn"
            style={{ justifyContent: "center" }}
            onClick={() => handleHeaderClick("progress")}
          >
            Progress {renderSortArrow("progress")}
          </button>
          <button
            type="button"
            className="mylist-th-btn"
            style={{ justifyContent: "flex-end" }}
            onClick={() => handleHeaderClick("date_added")}
          >
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
                          onDoubleClick={() => {
                            setEditingProgressKey(item.id);
                            setEditingProgressVal(item.progressNum);
                          }}
                          title="Click or double-click to type exact progress"
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
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill={item.is_favourite ? "var(--gold)" : "none"}
                      stroke={item.is_favourite ? "var(--gold)" : "currentColor"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
