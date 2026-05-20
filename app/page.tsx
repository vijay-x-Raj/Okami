"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaType, OkamiMedia } from "./lib/jikan";
import { fetchDetail, fetchSeason, fetchTop, searchMedia } from "./lib/api";
import { type OkamiEntry, type OkamiStatus, readEntries, upsertEntry, writeEntries } from "./lib/storage";

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
  type: ["All", "Anime", "Manga", "Films"],
  genre: ["Action", "Sci-Fi", "Seinen", "Shonen", "Horror", "Sports", "Fantasy", "Romance"],
  status: ["Watching", "Completed", "On Hold", "Dropped", "PTW"],
};

const statusOptions: Array<{ value: OkamiStatus; label: string; className: string }> = [
  { value: "watching", label: "Watching", className: "watching" },
  { value: "completed", label: "Completed", className: "completed" },
  { value: "on_hold", label: "On Hold", className: "hold" },
  { value: "dropped", label: "Dropped", className: "dropped" },
  { value: "plan_to_watch", label: "Plan to Watch", className: "plan" },
];

const sortOptions = ["Date Added", "Score", "Title A–Z", "Year"] as const;

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function statusLabel(status: OkamiStatus) {
  const match = statusOptions.find((option) => option.value === status);
  return match?.label ?? "Plan to Watch";
}

function statusClass(status: OkamiStatus) {
  const match = statusOptions.find((option) => option.value === status);
  return match?.className ?? "plan";
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
}: {
  entries: OkamiEntry[];
  activeView: "grid" | "list";
  setActiveView: (value: "grid" | "list") => void;
  activeType: string;
  setActiveType: (value: string) => void;
  activeGenre: string;
  setActiveGenre: (value: string) => void;
  activeStatus: string;
  setActiveStatus: (value: string) => void;
  sortBy: (typeof sortOptions)[number];
  setSortBy: (value: (typeof sortOptions)[number]) => void;
  onDetail: (media: OkamiMedia) => void;
  onEdit: (entry: OkamiEntry) => void;
}) {
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesType =
        activeType === "All" ||
        (activeType === "Anime" && entry.type === "anime") ||
        (activeType === "Manga" && entry.type === "manga") ||
        (activeType === "Films" && entry.format === "Film");

      const matchesGenre = entry.genres.length === 0 || entry.genres.includes(activeGenre);

      const statusValue = statusOptions.find((option) => option.label === activeStatus)?.value ?? "plan_to_watch";
      const matchesStatus = entry.status === statusValue;

      return matchesType && matchesGenre && matchesStatus;
    });
  }, [entries, activeType, activeGenre, activeStatus]);

  const sortedEntries = useMemo(() => {
    const next = [...filteredEntries];
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
  }, [filteredEntries, sortBy]);

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
          {libraryFilters.type.map((item) => (
            <button
              key={item}
              type="button"
              className={`pill ${activeType === item ? "active" : ""}`}
              onClick={() => setActiveType(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        <div className="filter-section">
          <span className="filter-label">Genre</span>
          {libraryFilters.genre.map((item) => (
            <button
              key={item}
              type="button"
              className={`pill ${activeGenre === item ? "active" : ""}`}
              onClick={() => setActiveGenre(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        <div className="filter-section">
          <span className="filter-label">Status</span>
          {libraryFilters.status.map((item) => (
            <button
              key={item}
              type="button"
              className={`pill ${activeStatus === item ? "active" : ""}`}
              onClick={() => setActiveStatus(item)}
            >
              {item}
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
        <span className="count-num">{String(sortedEntries.length).padStart(2, "0")}</span>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">No entries yet. Add titles from Explore.</div>
      ) : sortedEntries.length === 0 ? (
        <div className="empty-state">No entries match this filter.</div>
      ) : activeView === "grid" ? (
        <div className="grid library-grid">
          {sortedEntries.map((entry) => (
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
                  <span>{entry.year || "--"}</span> • {entry.format}
                </div>
              </div>
            </article>
          ))}
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
            <span>Action</span>
          </div>
          {sortedEntries.map((entry, index) => (
            <div
              key={entryKey(entry)}
              className={`library-row ${index % 2 === 0 ? "row-alt" : ""} ${entry.status === "watching" ? "row-watching" : ""}`}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <img className="row-cover" src={entry.cover} alt={entry.title} />
              <span className="title-cell">{entry.title}</span>
              <span className="mono">{entry.format}</span>
              <span className="mono">{entry.user_score ?? "--"}</span>
              <span className="mono">{formatScore(entry.official_score)}</span>
              <span className={`status-chip ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span>
              <span className="mono">
                {entry.progress} / {entry.total ?? "--"}
              </span>
              <span className="mono">{entry.date_added.slice(0, 10)}</span>
              <button className="table-action" type="button" aria-label="Edit entry" onClick={() => onEdit(entry)}>
                ✎
              </button>
            </div>
          ))}
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
  const [activeGenre, setActiveGenre] = useState("Action");
  const [activeSeason, setActiveSeason] = useState("Spring");
  const [activeStudio, setActiveStudio] = useState("Bones");
  const [activeType, setActiveType] = useState<"Anime" | "Manga">("Anime");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OkamiMedia[]>([]);
  const [topAnime, setTopAnime] = useState<OkamiMedia[]>([]);
  const [topManga, setTopManga] = useState<OkamiMedia[]>([]);
  const [seasonal, setSeasonal] = useState<OkamiMedia[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingTop, setLoadingTop] = useState(false);

  const debouncedQuery = useDebounce(query, 600);
  const typeValue: MediaType = activeType === "Manga" ? "manga" : "anime";

  useEffect(() => {
    let active = true;
    setLoadingTop(true);
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
    if (!debouncedQuery) {
      setResults([]);
      setLoadingSearch(false);
      return;
    }
    setLoadingSearch(true);
    searchMedia(typeValue, debouncedQuery)
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
  }, [debouncedQuery, typeValue]);

  const featured = seasonal[0];
  const heroSide = seasonal.slice(1, 3);

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
          onChange={(event) => setQuery(event.target.value)}
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
          {["Action", "Fantasy", "Seinen", "Romance"].map((item) => (
            <button
              key={item}
              className={`pill ${activeGenre === item ? "active" : ""}`}
              type="button"
              onClick={() => setActiveGenre(item)}
            >
              {item}
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
              onClick={() => setActiveSeason(item)}
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
              onClick={() => setActiveStudio(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="filter-divider" />
        <div className="filter-section">
          <span className="filter-label">Type</span>
          {["Anime", "Manga"].map((item) => (
            <button
              key={item}
              className={`pill ${activeType === item ? "active" : ""}`}
              type="button"
              onClick={() => setActiveType(item as "Anime" | "Manga")}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {query.trim().length === 0 ? (
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
          {loadingSearch ? (
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
          ) : results.length === 0 ? (
            <div className="empty-state">No results yet. Try a new title.</div>
          ) : (
            <div className="grid results-grid">
              {results.map((item) => {
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
  scoreDistribution,
}: {
  entries: OkamiEntry[];
  scoreDistribution: Array<{ score: number; value: number }>;
}) {
  const [activeTab, setActiveTab] = useState("All");
  const tabs = ["All", "Watching", "Completed", "On Hold", "Dropped", "Plan to Watch"];

  const filteredEntries = useMemo(() => {
    if (activeTab === "All") return entries;
    const statusValue = statusOptions.find((option) => option.label === activeTab)?.value;
    return entries.filter((entry) => entry.status === statusValue);
  }, [entries, activeTab]);

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
              <span className="score-chip">{entry.user_score ?? "--"}</span>
              <span className="mono">{formatScore(entry.official_score)}</span>
              <span className={`status-chip ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span>
              <span className="progress-chip">
                {entry.progress} / {entry.total ?? "--"}
              </span>
              <span className="mono">{entry.date_added.slice(0, 10)}</span>
              <button className="table-action" type="button" aria-label="More actions">
                ⋯
              </button>
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
                  <div className="bar-fill" style={{ width: `${item.value * 8}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-panel donut-panel">
          <div className="chart-title">Genre Breakdown</div>
          <div className="donut-wrap">
            <div className="donut" />
            <div className="donut-legend">
              {[
                { label: "Seinen", color: "accent" },
                { label: "Fantasy", color: "teal" },
                { label: "Drama", color: "gold" },
                { label: "Horror", color: "stone" },
                { label: "Action", color: "indigo" },
                { label: "Romance", color: "bronze" },
              ].map((item) => (
                <div className="legend-row" key={item.label}>
                  <span className={`legend-dot ${item.color}`} />
                  <span className="legend-label">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ProfileView({ profileStats }: { profileStats: Array<{ label: string; value: string }> }) {
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
            {[
              "Berserk",
              "Monster",
              "Vagabond",
              "Mushishi",
              "Evangelion",
            ].map((title) => (
              <div className="favourite-card" key={title}>
                <span className="favourite-title">{title}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="profile-card settings-card">
          <div className="section-header">
            <span className="section-title">Settings</span>
          </div>
          <div className="settings-list">
            <button className="settings-btn" type="button">
              Export data (JSON)
            </button>
            <button className="settings-btn" type="button">
              Import data (JSON)
            </button>
            <button className="settings-btn danger" type="button">
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
  onSave: (data: { status: OkamiStatus; progress: number; userScore: number | null; notes: string }) => void;
}) {
  const media = state?.media;
  const entry = state?.entry;
  const [status, setStatus] = useState<OkamiStatus>(entry?.status ?? "plan_to_watch");
  const [progress, setProgress] = useState(entry?.progress ?? 0);
  const [userScore, setUserScore] = useState<number | null>(entry?.user_score ?? null);
  const [notes, setNotes] = useState(entry?.notes ?? "");

  useEffect(() => {
    if (!media) return;
    setStatus(entry?.status ?? "plan_to_watch");
    setProgress(entry?.progress ?? 0);
    setUserScore(entry?.user_score ?? null);
    setNotes(entry?.notes ?? "");
  }, [media, entry]);

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
          <label className="field">
            <span className="field-label">Progress</span>
            <input
              type="number"
              min={0}
              value={progress}
              onChange={(event) => setProgress(Number(event.target.value))}
            />
          </label>
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
            onClick={() => onSave({ status, progress, userScore, notes })}
          >
            {entry ? "Update Entry" : "Add to Library"}
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
  onClose,
  onAdd,
}: {
  media: OkamiMedia | null;
  loading: boolean;
  inLibrary: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  if (!media) return null;

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
        </div>
        <div className="detail-section">
          <div className="detail-section-title">Synopsis</div>
          <p className="detail-synopsis">{loading ? "Loading details…" : media.synopsis || "No synopsis yet."}</p>
        </div>
      </aside>
    </div>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("Library");
  const [activeTab, setActiveTab] = useState("Anime");
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState("All");
  const [activeGenre, setActiveGenre] = useState("Action");
  const [activeStatus, setActiveStatus] = useState("Watching");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]>("Date Added");
  const [entries, setEntries] = useState<OkamiEntry[]>([]);
  const [modalState, setModalState] = useState<{ media: OkamiMedia; entry?: OkamiEntry } | null>(null);
  const [detailMedia, setDetailMedia] = useState<OkamiMedia | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setEntries(readEntries());
  }, []);

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entryKey(entry), entry])), [entries]);

  const scoreDistribution = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, index) => ({ score: 10 - index, value: 0 }));
    entries.forEach((entry) => {
      if (typeof entry.user_score === "number" && entry.user_score >= 1 && entry.user_score <= 10) {
        const idx = 10 - entry.user_score;
        if (buckets[idx]) buckets[idx].value += 1;
      }
    });
    return buckets;
  }, [entries]);

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

  const viewClass =
    activeNav === "Explore"
      ? "explore"
      : activeNav === "My List"
        ? "list"
        : activeNav === "Profile"
          ? "profile"
          : "library";

  const handleSaveEntry = (data: { status: OkamiStatus; progress: number; userScore: number | null; notes: string }) => {
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
      progress: data.progress,
      total: media.total ?? null,
      date_added: entry?.date_added ?? now,
      notes: data.notes,
      is_favourite: entry?.is_favourite ?? false,
    };

    const nextEntries = upsertEntry(entries, nextEntry);
    setEntries(nextEntries);
    writeEntries(nextEntries);
    setModalState(null);
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
          <button className="log-btn" type="button">
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
                <MyListView entries={entries} scoreDistribution={scoreDistribution} />
              ) : null}
              {activeNav === "Profile" ? <ProfileView profileStats={profileStats} /> : null}
            </div>
          </div>
        </div>
      </main>

      <AddEntryModal state={modalState} onClose={() => setModalState(null)} onSave={handleSaveEntry} />
      <DetailPanel
        media={detailMedia}
        loading={detailLoading}
        inLibrary={detailMedia ? entryMap.has(mediaKey(detailMedia)) : false}
        onClose={() => setDetailMedia(null)}
        onAdd={() => detailMedia && setModalState({ media: detailMedia, entry: entryMap.get(mediaKey(detailMedia)) })}
      />
    </div>
  );
}
