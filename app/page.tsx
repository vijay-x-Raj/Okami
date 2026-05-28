"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { JikanEpisode, JikanRelation, MediaType, OkamiMedia } from "./lib/jikan";
import { fetchDetail, fetchEpisodes, fetchRelated, fetchSeason, fetchTop, fetchVolumes, searchMedia } from "./lib/api";
import {
  addEntry,
  type OkamiEntry,
  type OkamiStatus,
  loadEntries,
  removeEntry,
  saveEntries,
  toggleFavourite,
  updateEntry,
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
    { label: "Watching", value: "watching" },
    { label: "Completed", value: "completed" },
    { label: "On Hold", value: "on_hold" },
    { label: "Dropped", value: "dropped" },
    { label: "PTW", value: "plan_to_watch" },
  ],
};

const statusOptions: Array<{ value: OkamiStatus; label: string; className: string }> = [
  { value: "watching", label: "Watching", className: "watching" },
  { value: "completed", label: "Completed", className: "completed" },
  { value: "on_hold", label: "On Hold", className: "hold" },
  { value: "dropped", label: "Dropped", className: "dropped" },
  { value: "plan_to_watch", label: "Plan to Watch", className: "plan" },
];

const sortOptions = ["Date Added", "Score", "Title A–Z", "Year"] as const;

const GENRE_MAP: Record<string, number> = {
  action: 1,
  adventure: 2,
  comedy: 4,
  drama: 8,
  fantasy: 10,
  horror: 14,
  romance: 22,
  "sci-fi": 24,
  seinen: 42,
  shonen: 27,
  sports: 30,
  supernatural: 37,
};

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function useOutsideClick<T extends HTMLElement>(ref: RefObject<T>, onClose: () => void) {
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
  return match?.label ?? "Plan to Watch";
}

function statusClass(status: OkamiStatus) {
  const match = statusOptions.find((option) => option.value === status);
  return match?.className ?? "plan";
}

function entryCategory(entry: OkamiEntry) {
  const format = entry.format?.toLowerCase?.() ?? "";
  if (format === "film" || format === "movie") {
    return { label: "Film", className: "type-film" };
  }
  if (entry.type === "manga") {
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

function ScoreCell({
  entry,
  editingKey,
  setEditingKey,
  onCommit,
  entries,
}: {
  entry: OkamiEntry;
  editingKey: string | null;
  setEditingKey: (value: string | null) => void;
  onCommit: (next: OkamiEntry[]) => void;
  entries: OkamiEntry[];
}) {
  const key = entryKey(entry);

  if (editingKey === key) {
    return (
      <input
        className="inline-input"
        type="number"
        min={1}
        max={10}
        step={0.5}
        defaultValue={entry.user_score ?? ""}
        autoFocus
        onBlur={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value) && value >= 1 && value <= 10) {
            onCommit(updateEntry(entries, entry.id, entry.type, { user_score: value }));
          }
          setEditingKey(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditingKey(null);
        }}
      />
    );
  }

  return (
    <span
      className={`score-chip ${entry.user_score ? "score-active" : ""}`}
      onClick={() => setEditingKey(key)}
    >
      {entry.user_score ?? "--"}
    </span>
  );
}

function ProgressCell({
  entry,
  editingKey,
  setEditingKey,
  onCommit,
  entries,
}: {
  entry: OkamiEntry;
  editingKey: string | null;
  setEditingKey: (value: string | null) => void;
  onCommit: (next: OkamiEntry[]) => void;
  entries: OkamiEntry[];
}) {
  const key = entryKey(entry);
  const unit = entry.type === "manga" ? "Ch" : "Ep";

  if (editingKey === key) {
    return (
      <input
        className="inline-input"
        type="number"
        min={0}
        max={entry.total ?? 9999}
        defaultValue={entry.progress}
        autoFocus
        onBlur={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value) && value >= 0) {
            onCommit(updateEntry(entries, entry.id, entry.type, { progress: value }));
          }
          setEditingKey(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditingKey(null);
        }}
      />
    );
  }

  return (
    <span className="progress-chip" onClick={() => setEditingKey(key)}>
      {unit} {entry.progress} / {entry.total ?? "--"}
    </span>
  );
}

function StatusCell({
  entry,
  onCommit,
  entries,
}: {
  entry: OkamiEntry;
  onCommit: (next: OkamiEntry[]) => void;
  entries: OkamiEntry[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  return (
    <div className="status-cell" ref={ref}>
      <button
        className={`status-chip ${statusClass(entry.status)}`}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        {statusLabel(entry.status)}
      </button>
      {open ? (
        <div className="menu">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              className={`menu-item ${option.value === entry.status ? "menu-item-active" : ""}`}
              type="button"
              onClick={() => {
                onCommit(updateEntry(entries, entry.id, entry.type, { status: option.value }));
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
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

function LibraryView({
  entries,
  activeView,
  setActiveView,
  activeType,
  setActiveType,
  activeGenre,
  setActiveGenre,
  activeStatus,
  setActiveStatus,
  sortBy,
  setSortBy,
  onDetail,
  onEdit,
  onRemove,
  onToggleFavourite,
  onExplore,
  onClearFilters,
}: {
  entries: OkamiEntry[];
  activeView: "grid" | "list";
  setActiveView: (value: "grid" | "list") => void;
  activeType: "all" | "anime" | "manga" | "films";
  setActiveType: (value: "all" | "anime" | "manga" | "films") => void;
  activeGenre: string;
  setActiveGenre: (value: string) => void;
  activeStatus: OkamiStatus | "";
  setActiveStatus: (value: OkamiStatus | "") => void;
  sortBy: (typeof sortOptions)[number];
  setSortBy: (value: (typeof sortOptions)[number]) => void;
  onDetail: (media: OkamiMedia) => void;
  onEdit: (entry: OkamiEntry) => void;
  onRemove: (entry: OkamiEntry) => void;
  onToggleFavourite: (entry: OkamiEntry) => void;
  onExplore: () => void;
  onClearFilters: () => void;
}) {
  const displayedEntries = useMemo(() => {
    let result = [...entries];

    if (activeType !== "all") {
      if (activeType === "films") {
        result = result.filter((entry) => {
          const format = entry.format?.toLowerCase?.() ?? "";
          return format === "film" || format === "movie";
        });
      } else {
        result = result.filter((entry) => entry.type === activeType);
      }
    }

    if (activeGenre) {
      result = result.filter((entry) =>
        entry.genres?.some((genre) => genre.toLowerCase() === activeGenre.toLowerCase())
      );
    }

    if (activeStatus) {
      result = result.filter((entry) => entry.status === activeStatus);
    }

    const next = [...result];
    switch (sortBy) {
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
      case "Year":
        next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        break;
      default:
        next.sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime());
    }
    return next;
  }, [entries, activeType, activeGenre, activeStatus, sortBy]);

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">本棚</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">LIBRARY</span>
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
        <div className="page-sub">Your full personal collection</div>
      </div>

      <div className="filter-bar">
        <div className="filter-section">
          <span className="filter-label">Type</span>
          {libraryFilters.type.map((item) => {
            const typeClass =
              item.value === "anime"
                ? "type-anime"
                : item.value === "manga"
                  ? "type-manga"
                  : item.value === "films"
                    ? "type-film"
                    : "";
            return (
              <button
                key={item.value}
                type="button"
                className={`pill ${typeClass ? `pill-type ${typeClass}` : ""} ${activeType === item.value ? "active" : ""}`}
                onClick={() => setActiveType(activeType === item.value ? "all" : item.value)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="filter-divider" />

        <div className="filter-section">
          <span className="filter-label">Genre</span>
          {libraryFilters.genre.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`pill ${activeGenre === item.value ? "active" : ""}`}
              onClick={() => setActiveGenre(activeGenre === item.value ? "" : item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        <div className="filter-section">
          <span className="filter-label">Status</span>
          {libraryFilters.status.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`pill ${activeStatus === item.value ? "active" : ""}`}
              onClick={() =>
                setActiveStatus(activeStatus === item.value ? "" : (item.value as OkamiStatus))
              }
            >
              {item.label}
            </button>
          ))}
        </div>

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
      </div>

      <div className="count-row">
        <span className="count-label">Entries</span>
        <span className="count-num">{String(entries.length).padStart(3, "0")}</span>
        <span className="count-label" style={{ marginLeft: 16 }}>
          Showing
        </span>
        <span className="count-num">{String(displayedEntries.length).padStart(2, "0")}</span>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state empty-state-large">
          <div className="empty-title">Your vault is empty</div>
          <div className="empty-sub">Add titles from Explore to start tracking.</div>
          <button className="empty-action" type="button" onClick={onExplore}>
            Explore Now →
          </button>
        </div>
      ) : displayedEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">No entries match this filter</div>
          <div className="empty-sub">Try adjusting your filters or add more titles.</div>
          <button className="empty-link" type="button" onClick={onClearFilters}>
            Clear Filters
          </button>
        </div>
      ) : activeView === "grid" ? (
        <div className="grid library-grid">
          {displayedEntries.map((entry) => {
            const category = entryCategory(entry);
            return (
              <article className="card" key={entryKey(entry)}>
                <div className="card-img-wrap">
                  <img className="card-img" src={entry.cover} alt={entry.title} />
                  <div className="card-img-overlay" />
                  <div className="card-actions">
                    <button className="card-action-btn" type="button" onClick={() => onEdit(entry)}>
                      Update
                    </button>
                    <button className="card-action-btn" type="button" onClick={() => onDetail(entryToMedia(entry))}>
                      Detail
                    </button>
                  </div>
                  <div className={`score-badge ${entry.official_score >= 9 ? "gold" : ""}`}>
                    {formatScore(entry.official_score)}
                  </div>
                  <div className={`status-badge ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</div>
                </div>
                <div className="card-info">
                  <div className="card-title">{entry.title}</div>
                  <div className="card-meta">
                    <span className={`type-chip ${category.className}`}>{category.label}</span>
                    <span className="meta-dot">•</span>
                    <span>{entry.year || "--"}</span>
                    <span className="meta-dot">•</span>
                    <span>{entry.format}</span>
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
            <span>Date Added</span>
            <span>⋯</span>
          </div>
          {displayedEntries.map((entry, index) => {
            const category = entryCategory(entry);
            return (
              <div
                key={entryKey(entry)}
                className={`library-row ${index % 2 === 0 ? "row-alt" : ""} ${entry.status === "watching" ? "row-watching" : ""}`}
              >
                <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                <img className="row-cover" src={entry.cover} alt={entry.title} />
                <span className="title-cell">{entry.title}</span>
                <span className={`type-chip ${category.className}`}>{category.label}</span>
                <span className="mono">{entry.user_score ?? "--"}</span>
                <span className="mono">{formatScore(entry.official_score)}</span>
                <span className={`status-chip ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span>
                <span className="mono">
                  {entry.progress} / {entry.total ?? "--"}
                </span>
                <span className="mono">{entry.date_added.slice(0, 10)}</span>
                <EntryMenu
                  entry={entry}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onToggleFavourite={onToggleFavourite}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ExploreView({
  entryMap,
  onAdd,
  onDetail,
}: {
  entryMap: Map<string, OkamiEntry>;
  onAdd: (media: OkamiMedia) => void;
  onDetail: (media: OkamiMedia) => void;
}) {
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeSeason, setActiveSeason] = useState("");
  const [activeStudio, setActiveStudio] = useState("");
  const [activeType, setActiveType] = useState<MediaType>("anime");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OkamiMedia[]>([]);
  const [topAnime, setTopAnime] = useState<OkamiMedia[]>([]);
  const [topManga, setTopManga] = useState<OkamiMedia[]>([]);
  const [seasonal, setSeasonal] = useState<OkamiMedia[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingTop, setLoadingTop] = useState(true);

  const debouncedQuery = useDebounce(query, 600);
  const genreIds = useMemo(
    () => activeGenres.map((genre) => GENRE_MAP[genre]).filter(Boolean),
    [activeGenres]
  );
  const shouldSearch =
    debouncedQuery.trim().length > 0 || activeGenres.length > 0 || Boolean(activeSeason) || Boolean(activeStudio);

  useEffect(() => {
    let active = true;
    Promise.all([fetchTop("anime"), fetchTop("manga"), fetchSeason()])
      .then(([anime, manga, season]) => {
        if (!active) return;
        setTopAnime(anime);
        setTopManga(manga);
        setSeasonal(season);
      })
      .catch(() => {
        if (!active) return;
        setTopAnime([]);
        setTopManga([]);
        setSeasonal([]);
      })
      .finally(() => {
        if (active) setLoadingTop(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!shouldSearch) return () => {
      active = false;
    };
    searchMedia(activeType, debouncedQuery, {
      genres: genreIds.length ? genreIds.join(",") : undefined,
      season: activeSeason || undefined,
      studio: activeStudio || undefined,
      limit: 20,
    })
      .then((data) => {
        if (!active) return;
        setResults(data);
      })
      .catch(() => {
        if (!active) return;
        setResults([]);
      })
      .finally(() => {
        if (active) setLoadingSearch(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, activeGenres, activeSeason, activeStudio, activeType, genreIds, shouldSearch]);

  const featured = seasonal[0];
  const heroSide = seasonal.slice(1, 3);
  const searchResults = shouldSearch ? results : [];
  const searchLoading = shouldSearch ? loadingSearch : false;

  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">探</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">EXPLORE</span>
        </div>
        <div className="page-sub">Search and discover the vault</div>
      </div>

      <div className="search-bar">
        <span className="search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          className="search-input"
          placeholder="SEARCH TITLE, AUTHOR, STUDIO..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLoadingSearch(true);
          }}
        />
        <div className="view-toggle">
          <button className="view-btn active" type="button" aria-label="Grid view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button className="view-btn" type="button" aria-label="List view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="explore-filters">
        <div className="filter-section">
          <span className="filter-label">Genre</span>
          {[
            { label: "Action", value: "action" },
            { label: "Fantasy", value: "fantasy" },
            { label: "Seinen", value: "seinen" },
            { label: "Romance", value: "romance" },
          ].map((item) => (
            <button
              key={item.value}
              className={`pill ${activeGenres.includes(item.value) ? "active" : ""}`}
              type="button"
              onClick={() => {
                setLoadingSearch(true);
                setActiveGenres((prev) =>
                  prev.includes(item.value) ? prev.filter((genre) => genre !== item.value) : [...prev, item.value]
                );
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filter-divider" />
        <div className="filter-section">
          <span className="filter-label">Season</span>
          {["Winter", "Spring", "Summer", "Fall"].map((item) => (
            <button
              key={item}
              className={`pill ${activeSeason === item ? "active" : ""}`}
              type="button"
              onClick={() => {
                setLoadingSearch(true);
                setActiveSeason(activeSeason === item ? "" : item);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="filter-divider" />
        <div className="filter-section">
          <span className="filter-label">Studio</span>
          {["Bones", "Madhouse", "Wit", "MAPPA"].map((item) => (
            <button
              key={item}
              className={`pill ${activeStudio === item ? "active" : ""}`}
              type="button"
              onClick={() => {
                setLoadingSearch(true);
                setActiveStudio(activeStudio === item ? "" : item);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="filter-divider" />
        <div className="filter-section">
          <span className="filter-label">Type</span>
          {[
            { label: "Anime", value: "anime" },
            { label: "Manga", value: "manga" },
          ].map((item) => (
            <button
              key={item.value}
              className={`pill ${activeType === item.value ? "active" : ""}`}
              type="button"
              onClick={() => {
                setLoadingSearch(true);
                setActiveType(item.value as MediaType);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!shouldSearch ? (
        <>
          <div className="hero-grid">
            <div
              className="hero-main"
              style={{
                backgroundImage: `url(${featured?.cover || "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80"})`,
              }}
            >
              <div className="hero-overlay" />
              <div className="hero-content">
                <span className="hero-stamp">Featured</span>
                <h3 className="hero-title">{featured?.title || "Dungeon Meshi"}</h3>
                <div className="hero-tags">
                  {(featured?.genres.slice(0, 3) || ["Fantasy", "Adventure", "Seinen"]).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="hero-btn" type="button" onClick={() => featured && onAdd(featured)}>
                  + Add to Library
                </button>
              </div>
            </div>
            <div className="hero-side">
              {(heroSide.length ? heroSide : []).map((item) => (
                <div className="hero-mini" key={item.id}>
                  <img src={item.cover} alt={item.title} />
                  <div className="hero-mini-content">
                    <div className="hero-mini-title">{item.title}</div>
                    <div className="hero-mini-tags">
                      <span className="tag">{item.genres[0] || "Feature"}</span>
                    </div>
                    <button className="hero-mini-btn" type="button" onClick={() => onAdd(item)}>
                      + Add
                    </button>
                  </div>
                </div>
              ))}
              {loadingTop && heroSide.length === 0 ? (
                <div className="empty-state">Loading seasonal picks…</div>
              ) : null}
            </div>
          </div>

          <section className="strip">
            <div className="strip-header">
              <span className="section-title">Top Rated This Season</span>
              <button className="strip-link" type="button">
                View All →
              </button>
            </div>
            <div className="strip-cards">
              {(seasonal.length ? seasonal : []).slice(0, 8).map((item) => (
                <div className="strip-card" key={item.id}>
                  <div className="strip-card-title">{item.title}</div>
                  <div className="strip-card-tag">{item.genres[0] || "Season"}</div>
                </div>
              ))}
              {loadingTop && seasonal.length === 0 ? <div className="strip-card">Loading…</div> : null}
            </div>
          </section>

          <section className="strip">
            <div className="strip-header">
              <span className="section-title">All-Time Classics</span>
              <button className="strip-link" type="button">
                View All →
              </button>
            </div>
            <div className="strip-cards">
              {topAnime.slice(0, 8).map((item) => (
                <div className="strip-card" key={item.id}>
                  <div className="strip-card-title">{item.title}</div>
                  <div className="strip-card-tag">Top Anime</div>
                </div>
              ))}
              {loadingTop && topAnime.length === 0 ? <div className="strip-card">Loading…</div> : null}
            </div>
          </section>

          <section className="strip">
            <div className="strip-header">
              <span className="section-title">Manga Essentials</span>
              <button className="strip-link" type="button">
                View All →
              </button>
            </div>
            <div className="strip-cards">
              {topManga.slice(0, 8).map((item) => (
                <div className="strip-card" key={item.id}>
                  <div className="strip-card-title">{item.title}</div>
                  <div className="strip-card-tag">Top Manga</div>
                </div>
              ))}
              {loadingTop && topManga.length === 0 ? <div className="strip-card">Loading…</div> : null}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="section-header">
            <span className="section-title">Search Results</span>
          </div>
          {searchLoading ? (
            <div className="grid results-grid">
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="skeleton-card" key={`skeleton-${index}`}>
                  <div className="skeleton skeleton-img" />
                  <div className="skeleton-body">
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="empty-state">No results yet. Try a new title.</div>
          ) : (
            <div className="grid results-grid">
              {searchResults.map((item) => {
                const inLibrary = entryMap.has(mediaKey(item));
                return (
                  <article className="card" key={mediaKey(item)}>
                    <div className="card-img-wrap">
                      <img className="card-img" src={item.cover} alt={item.title} />
                      <div className="card-img-overlay" />
                      <div className="card-actions">
                        <button
                          className={`card-action-btn ${inLibrary ? "in-library" : "primary"}`}
                          type="button"
                          onClick={() => (inLibrary ? onDetail(item) : onAdd(item))}
                        >
                          {inLibrary ? "In Library ✓" : "+ Add to Library"}
                        </button>
                      </div>
                      <div className={`score-badge ${item.official_score >= 9 ? "gold" : ""}`}>
                        {formatScore(item.official_score)}
                      </div>
                    </div>
                    <div className="card-info">
                      <div className="card-title">{item.title}</div>
                      <div className="card-meta">
                        <span>{item.year || "--"}</span> • {item.format}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function MyListView({
  entries,
  onEdit,
  onRemove,
  onToggleFavourite,
  onCommitEntries,
}: {
  entries: OkamiEntry[];
  onEdit: (entry: OkamiEntry) => void;
  onRemove: (entry: OkamiEntry) => void;
  onToggleFavourite: (entry: OkamiEntry) => void;
  onCommitEntries: (next: OkamiEntry[]) => void;
}) {
  const [activeTab, setActiveTab] = useState("All");
  const [editingScore, setEditingScore] = useState<string | null>(null);
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const tabs = ["All", "Watching", "Completed", "On Hold", "Dropped", "Plan to Watch"];

  const filteredEntries = useMemo(() => {
    if (activeTab === "All") return entries;
    const statusValue = statusOptions.find((option) => option.label === activeTab)?.value;
    return entries.filter((entry) => entry.status === statusValue);
  }, [entries, activeTab]);

  const scoreDistribution = useMemo(() => {
    const counts = Array.from({ length: 10 }, (_, index) => ({ score: index + 1, value: 0 }));
    entries.forEach((entry) => {
      if (typeof entry.user_score === "number" && entry.user_score >= 1 && entry.user_score <= 10) {
        const index = Math.round(entry.user_score) - 1;
        if (counts[index]) counts[index].value += 1;
      }
    });
    return counts;
  }, [entries]);

  const maxScoreCount = useMemo(
    () => Math.max(1, ...scoreDistribution.map((item) => item.value)),
    [scoreDistribution]
  );

  const genreData = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry) => {
      entry.genres?.forEach((genre) => {
        map.set(genre, (map.get(genre) ?? 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [entries]);

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

  return (
    <>
      <div className="page-header list-header">
        <div className="page-title-row">
          <span className="page-title-kanji">一覧</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">MY LIST</span>
          <span className="entries-badge">{String(entries.length).padStart(3, "0")} entries</span>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-pill">
          <span className="stat-label">Total Entries</span>
          <span className="stat-value">{String(entries.length).padStart(3, "0")}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{String(entries.filter((entry) => entry.status === "completed").length).padStart(2, "0")}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Currently Watching</span>
          <span className="stat-value">{String(entries.filter((entry) => entry.status === "watching").length).padStart(2, "0")}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Mean Score</span>
          <span className="stat-value">
            {entries.length
              ? (
                  entries.reduce((sum, entry) => sum + (entry.user_score ?? 0), 0) /
                  Math.max(1, entries.filter((entry) => entry.user_score != null).length)
                ).toFixed(1)
              : "--"}
          </span>
        </div>
      </div>

      <div className="status-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`status-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">No entries yet. Add titles from Explore.</div>
      ) : (
        <div className="list-table">
          <div className="list-row table-header">
            <span>#</span>
            <span>Cover</span>
            <span>Title</span>
            <span>Type</span>
            <span>My Score</span>
            <span>Official</span>
            <span>Status</span>
            <span>Progress</span>
            <span>Date Added</span>
            <span>⋯</span>
          </div>
          {filteredEntries.map((entry, index) => (
            <div
              className={`list-row ${index % 2 === 0 ? "row-alt" : ""} ${entry.status === "watching" ? "row-watching" : ""}`}
              key={entryKey(entry)}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <img className="row-cover" src={entry.cover} alt={entry.title} />
              <span className="title-cell">{entry.title}</span>
              <span className="mono">{entry.format}</span>
              <ScoreCell
                entry={entry}
                editingKey={editingScore}
                setEditingKey={setEditingScore}
                onCommit={onCommitEntries}
                entries={entries}
              />
              <span className="mono">{formatScore(entry.official_score)}</span>
              <StatusCell entry={entry} onCommit={onCommitEntries} entries={entries} />
              <ProgressCell
                entry={entry}
                editingKey={editingProgress}
                setEditingKey={setEditingProgress}
                onCommit={onCommitEntries}
                entries={entries}
              />
              <span className="mono">{entry.date_added.slice(0, 10)}</span>
              <EntryMenu
                entry={entry}
                onEdit={onEdit}
                onRemove={onRemove}
                onToggleFavourite={onToggleFavourite}
              />
            </div>
          ))}
        </div>
      )}

      <div className="chart-grid">
        <div className="chart-panel">
          <div className="chart-title">Score Distribution</div>
          <div className="score-chart">
            {scoreDistribution.map((item) => (
              <div className="bar-row" key={item.score}>
                <span className="bar-label">{item.score}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(item.value / maxScoreCount) * 100}%` }} />
                </div>
                <span className="bar-count">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-panel donut-panel">
          <div className="chart-title">Genre Breakdown</div>
          <div className="donut-wrap">
            <div className="donut" style={{ background: `conic-gradient(${donutStops})` }}>
              {genreData.length === 0 ? <span className="donut-label">No Data</span> : null}
            </div>
            <div className="donut-legend">
              {genreData.length === 0 ? (
                <span className="legend-label">No genre data yet.</span>
              ) : (
                genreData.map((item, index) => (
                  <div className="legend-row" key={item.label}>
                    <span className="legend-dot" style={{ background: ["#E8194B", "#3DB89C", "#C4A84F", "#4A4A5A", "#5B5BFF", "#C47B3D"][index % 6] }} />
                    <span className="legend-label">{item.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ProfileView({
  profileStats,
  favourites,
  onExport,
  onImport,
  onClear,
}: {
  profileStats: Array<{ label: string; value: string }>;
  favourites: OkamiEntry[];
  onExport: () => void;
  onImport: () => void;
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
        <div className="page-sub">Stats, exports, and vault controls</div>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-avatar">YK</div>
            <div>
              <div className="profile-name">Yuki K.</div>
              <div className="profile-join">Joined • 2023-04-09</div>
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
              <div className="empty-inline">No favourites yet. Mark entries in My List.</div>
            ) : (
              favourites.slice(0, 5).map((entry) => (
                <div className="favourite-card" key={entryKey(entry)}>
                  <img className="favourite-cover" src={entry.cover} alt={entry.title} />
                  <span className="favourite-title">{entry.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="profile-card settings-card">
          <div className="section-header">
            <span className="section-title">Settings</span>
          </div>
          <div className="settings-list">
            <button className="settings-btn" type="button" onClick={onExport}>
              Export data (JSON)
            </button>
            <button className="settings-btn" type="button" onClick={onImport}>
              Import data (JSON)
            </button>
            <button className="settings-btn danger" type="button" onClick={onClear}>
              Clear all data
            </button>
          </div>
        </div>
      </div>
    </>
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
    completedSeasons: number[];
    completedVolumes: number[];
  }) => void;
}) {
  const media = state?.media;
  const entry = state?.entry;
  const [status, setStatus] = useState<OkamiStatus>(() => entry?.status ?? "plan_to_watch");
  const [userScore, setUserScore] = useState<number | null>(() => entry?.user_score ?? null);
  const [notes, setNotes] = useState(() => entry?.notes ?? "");
  const [seasonCount, setSeasonCount] = useState<number | null>(null);
  const [volumeCount, setVolumeCount] = useState<number | null>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(() => entry?.completed_seasons ?? []);
  const [selectedVolumes, setSelectedVolumes] = useState<number[]>(() => entry?.completed_volumes ?? []);
  const [countsLoading, setCountsLoading] = useState(Boolean(media));

  const toggleSelection = (current: number[], value: number) => {
    if (current.includes(value)) {
      return current.filter((item) => item !== value);
    }
    return [...current, value].sort((a, b) => a - b);
  };

  useEffect(() => {
    if (!media) return;

    let active = true;

    const loadCounts = async () => {
      try {
        const detail = await fetchDetail(media.type, media.id);
        if (!active) return;
        if (media.type === "manga") {
          const count = detail.volumes ?? null;
          const safeCount = count && count > 0 ? count : null;
          setVolumeCount(safeCount);
          if (safeCount) {
            setSelectedVolumes((current) => current.filter((value) => value <= safeCount));
          }
        } else {
          const related = await fetchRelated("anime", media.id);
          if (!active) return;
          const sequelCount = related
            .filter((relation) => (relation.relation ?? "").toLowerCase() === "sequel")
            .reduce(
              (sum, relation) =>
                sum + (relation.entry?.filter((item) => (item.type ?? "").toLowerCase() === "anime").length ?? 0),
              0
            );
          const episodes = detail.episodes ?? detail.total ?? 0;
          const estimated = episodes ? Math.max(1, Math.ceil(episodes / 12)) : 1;
          const count = Math.max(estimated, sequelCount + 1);
          setSeasonCount(count);
          setSelectedSeasons((current) => current.filter((value) => value <= count));
        }
      } catch {
        if (!active) return;
        setSeasonCount(null);
        setVolumeCount(null);
      } finally {
        if (active) setCountsLoading(false);
      }
    };

    loadCounts();

    return () => {
      active = false;
    };
  }, [media]);

  if (!media) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <img className="modal-cover" src={media.cover} alt={media.title} />
          <div>
            <div className="modal-title">{media.title}</div>
            <div className="modal-meta">
              <span>{media.year || "--"}</span> • {media.format}
            </div>
            <div className="modal-tags">
              {media.genres.slice(0, 4).map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-fields">
          <label className="field">
            <span className="field-label">Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as OkamiStatus)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {media.type === "anime" ? (
            <div className="field">
              <span className="field-label">Seasons Completed</span>
              {countsLoading ? (
                <span className="field-help">Loading season count…</span>
              ) : seasonCount ? (
                <>
                  <div className="tile-grid">
                    {Array.from({ length: seasonCount }, (_, index) => {
                      const value = index + 1;
                      const active = selectedSeasons.includes(value);
                      return (
                        <button
                          key={`season-${value}`}
                          type="button"
                          className={`tile ${active ? "active" : ""}`}
                          aria-pressed={active}
                          onClick={() => setSelectedSeasons((current) => toggleSelection(current, value))}
                        >
                          S{String(value).padStart(2, "0")}
                        </button>
                      );
                    })}
                  </div>
                  <span className="field-help">
                    {selectedSeasons.length} / {seasonCount} seasons marked complete.
                  </span>
                </>
              ) : (
                <span className="field-help">Season count unavailable.</span>
              )}
            </div>
          ) : null}
          {media.type === "manga" ? (
            <div className="field">
              <span className="field-label">Volumes Completed</span>
              {countsLoading ? (
                <span className="field-help">Loading volume count…</span>
              ) : volumeCount ? (
                <>
                  <div className="tile-grid">
                    {Array.from({ length: volumeCount }, (_, index) => {
                      const value = index + 1;
                      const active = selectedVolumes.includes(value);
                      return (
                        <button
                          key={`volume-${value}`}
                          type="button"
                          className={`tile ${active ? "active" : ""}`}
                          aria-pressed={active}
                          onClick={() => setSelectedVolumes((current) => toggleSelection(current, value))}
                        >
                          V{String(value).padStart(2, "0")}
                        </button>
                      );
                    })}
                  </div>
                  <span className="field-help">
                    {selectedVolumes.length} / {volumeCount} volumes marked complete.
                  </span>
                </>
              ) : (
                <span className="field-help">Volume count unavailable.</span>
              )}
            </div>
          ) : null}
          <label className="field">
            <span className="field-label">My Score</span>
            <select
              value={userScore ?? ""}
              onChange={(event) => setUserScore(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">--</option>
              {Array.from({ length: 10 }, (_, index) => 10 - index).map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-notes">
            <span className="field-label">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="modal-btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            type="button"
            onClick={() =>
              onSave({
                status,
                userScore,
                notes,
                completedSeasons: selectedSeasons,
                completedVolumes: selectedVolumes,
              })
            }
          >
            {entry ? "Update Entry" : "Add to Library"}
          </button>
        </div>
      </div>
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
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.title.toLowerCase().includes(needle));
  }, [entries, query]);

  const handleSelect = (entry: OkamiEntry) => {
    setSelected(entry);
    setProgress(String(entry.progress));
  };

  const handleSave = () => {
    if (!selected) return;
    const value = Number(progress);
    if (!Number.isFinite(value) || value < 0) return;
    onCommit(updateEntry(entries, selected.id, selected.type, { progress: value }));
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">Log Progress</div>
        <div className="search-bar log-search">
          <input
            className="search-input"
            placeholder="SEARCH YOUR LIBRARY..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="log-list">
          {filtered.length === 0 ? (
            <div className="empty-state">No entries found.</div>
          ) : (
            filtered.map((entry) => (
              <button
                className={`log-item ${selected?.id === entry.id && selected?.type === entry.type ? "active" : ""}`}
                type="button"
                key={entryKey(entry)}
                onClick={() => handleSelect(entry)}
              >
                <img className="log-cover" src={entry.cover} alt={entry.title} />
                <div>
                  <div className="log-title">{entry.title}</div>
                  <div className="log-meta">
                    {entry.type === "manga" ? "Ch" : "Ep"} {entry.progress} / {entry.total ?? "--"}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        {selected ? (
          <div className="log-progress">
            <span className="log-progress-label">
              New {selected.type === "manga" ? "Chapter" : "Episode"}
            </span>
            <input
              className="inline-input"
              type="number"
              min={0}
              max={selected.total ?? 9999}
              value={progress}
              onChange={(event) => setProgress(event.target.value)}
            />
            <span className="log-progress-meta">/ {selected.total ?? "--"}</span>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="modal-btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn primary" type="button" onClick={handleSave} disabled={!selected}>
            Save
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
  const [volumes, setVolumes] = useState<unknown[]>([]);
  const [related, setRelated] = useState<JikanRelation[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const relatedItems = useMemo(() => {
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
        setEpisodes(data);
      } finally {
        setTabLoading(false);
      }
    }

    if (tab === "volumes" && media.type === "manga" && volumes.length === 0) {
      setTabLoading(true);
      try {
        const data = await fetchVolumes(media.id);
        setVolumes(data);
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
              Open Tracking Page
            </Link>
          ) : null}
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
                {episodes.map((episode, index) => (
                  <div className={`detail-list-row ${index % 2 === 0 ? "row-alt" : ""}`} key={episode.mal_id}>
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
                {volumes.map((item, index) => {
                  const name = (item as { name?: string; title?: string })?.name ||
                    (item as { title?: string })?.title ||
                    `Entry ${index + 1}`;
                  return (
                    <div className={`detail-list-row ${index % 2 === 0 ? "row-alt" : ""}`} key={`${name}-${index}`}>
                      <span className="detail-list-id">VOL.{String(index + 1).padStart(2, "0")}</span>
                      <span className="detail-list-title">{name}</span>
                    </div>
                  );
                })}
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

export default function Home() {
  const [activeNav, setActiveNav] = useState("Library");
  const [activeTab, setActiveTab] = useState("Anime");
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState<"all" | "anime" | "manga" | "films">("all");
  const [activeGenre, setActiveGenre] = useState("");
  const [activeStatus, setActiveStatus] = useState<OkamiStatus | "">("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]>("Date Added");
  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [modalState, setModalState] = useState<{ media: OkamiMedia; entry?: OkamiEntry } | null>(null);
  const [detailMedia, setDetailMedia] = useState<OkamiMedia | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logProgressOpen, setLogProgressOpen] = useState(false);

  const commitEntries = useCallback((next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  }, []);

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entryKey(entry), entry])), [entries]);

  const profileStats = useMemo(() => {
    const totalEntries = entries.length;
    const episodesWatched = entries.filter((entry) => entry.type === "anime").reduce((sum, entry) => sum + entry.progress, 0);
    const chaptersRead = entries.filter((entry) => entry.type === "manga").reduce((sum, entry) => sum + entry.progress, 0);
    const daysConsumed = Math.round((episodesWatched * 24 + chaptersRead * 5) / 60 / 24) || 0;
    const genreCount = new Map<string, number>();
    entries.forEach((entry) => {
      entry.genres.forEach((genre) => {
        genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
      });
    });
    const favouriteGenre = Array.from(genreCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "--";
    const scoredEntries = entries.filter((entry) => entry.user_score != null);
    const meanScore = scoredEntries.length
      ? (scoredEntries.reduce((sum, entry) => sum + (entry.user_score ?? 0), 0) / scoredEntries.length).toFixed(1)
      : "--";

    return [
      { label: "Total Entries", value: String(totalEntries).padStart(3, "0") },
      { label: "Episodes Watched", value: String(episodesWatched) },
      { label: "Chapters Read", value: String(chaptersRead) },
      { label: "Days Consumed", value: String(daysConsumed) },
      { label: "Favourite Genre", value: favouriteGenre },
      { label: "Mean Score", value: meanScore },
    ];
  }, [entries]);

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
    completedSeasons: number[];
    completedVolumes: number[];
  }) => {
    if (!modalState) return;
    const { media, entry } = modalState;
    const now = new Date().toISOString();
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
      status: data.status,
      progress: entry?.progress ?? 0,
      total: media.total ?? null,
      completed_seasons: data.completedSeasons,
      completed_volumes: data.completedVolumes,
      completed_episodes: entry?.completed_episodes ?? [],
      date_added: entry?.date_added ?? now,
      notes: data.notes,
      is_favourite: entry?.is_favourite ?? false,
    };

    const nextEntries = entry
      ? updateEntry(entries, entry.id, entry.type, nextEntry)
      : addEntry(entries, nextEntry);
    commitEntries(nextEntries);
    setModalState(null);
  };

  const handleRemoveEntry = (entry: OkamiEntry) => {
    commitEntries(removeEntry(entries, entry.id, entry.type));
  };

  const handleToggleFavourite = (entry: OkamiEntry) => {
    commitEntries(toggleFavourite(entries, entry.id, entry.type));
  };

  const openDetail = async (media: OkamiMedia) => {
    setDetailMedia(media);
    setDetailLoading(true);
    try {
      const detail = await fetchDetail(media.type, media.id);
      setDetailMedia(detail);
    } catch {
      setDetailMedia(media);
    } finally {
      setDetailLoading(false);
    }
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

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
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
        const imported = JSON.parse(text) as OkamiEntry[];
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        const merged = [...entries];
        imported.forEach((incoming) => {
          if (!merged.find((existing) => existing.id === incoming.id && existing.type === incoming.type)) {
            merged.push(incoming);
          }
        });
        commitEntries(merged);
        alert(`Imported ${imported.length} entries.`);
      } catch {
        alert("Invalid file. Expected a valid Okami JSON backup.");
      }
    };
    input.click();
  };

  const handleClear = () => {
    if (confirm("This will permanently delete all your entries. Are you sure?")) {
      if (confirm("Last chance — this cannot be undone.")) {
        commitEntries([]);
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
          <button className="sidebar-util" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
            </svg>
            Settings
          </button>
          <button className="sidebar-util" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" />
            </svg>
            Logout
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
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
            >
              {tab}
            </button>
          ))}
          <div className="topbar-right">
            <button className="topbar-icon" type="button" aria-label="Search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button className="topbar-icon" type="button" aria-label="Notifications">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </button>
            <button className="avatar" type="button" aria-label="Profile">
              YK
            </button>
          </div>
        </div>

        <div className={`content content-area-bg ${viewClass}`}>
          <div className="content-inner">
            <div key={activeNav} className="view-panel">
              {activeNav === "Library" ? (
                <LibraryView
                  entries={entries}
                  activeView={activeView}
                  setActiveView={setActiveView}
                  activeType={activeType}
                  setActiveType={setActiveType}
                  activeGenre={activeGenre}
                  setActiveGenre={setActiveGenre}
                  activeStatus={activeStatus}
                  setActiveStatus={setActiveStatus}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  onDetail={openDetail}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onExplore={() => setActiveNav("Explore")}
                  onClearFilters={clearLibraryFilters}
                />
              ) : null}
              {activeNav === "Explore" ? (
                <ExploreView
                  entryMap={entryMap}
                  onAdd={(media) => setModalState({ media })}
                  onDetail={openDetail}
                />
              ) : null}
              {activeNav === "My List" ? (
                <MyListView
                  entries={entries}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onCommitEntries={commitEntries}
                />
              ) : null}
              {activeNav === "Profile" ? (
                <ProfileView
                  profileStats={profileStats}
                  favourites={favourites}
                  onExport={handleExport}
                  onImport={handleImport}
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
