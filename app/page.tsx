"use client";

import { useState } from "react";

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

const libraryCards = [
  {
    title: "Neon Genesis Evangelion",
    year: 1995,
    format: "TV Series",
    score: "9.5",
    statusLabel: "Completed",
    statusClass: "completed",
    cover: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&q=80",
  },
  {
    title: "Berserk",
    year: 1997,
    format: "Manga",
    score: "9.8",
    statusLabel: "Watching",
    statusClass: "watching",
    cover: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=300&q=80",
  },
  {
    title: "Vinland Saga",
    year: 2019,
    format: "TV Series",
    score: "8.8",
    statusLabel: "Plan to Watch",
    statusClass: "plan",
    cover: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&q=80",
  },
  {
    title: "Ghost in the Shell",
    year: 1995,
    format: "Film",
    score: "9.2",
    statusLabel: "Completed",
    statusClass: "completed",
    cover: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=300&q=80",
  },
  {
    title: "Mushishi",
    year: 2005,
    format: "TV Series",
    score: "8.7",
    statusLabel: "On Hold",
    statusClass: "hold",
    cover: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=300&q=80",
  },
  {
    title: "Perfect Blue",
    year: 1997,
    format: "Film",
    score: "9.1",
    statusLabel: "Completed",
    statusClass: "completed",
    cover: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&q=80",
  },
  {
    title: "Vagabond",
    year: 1998,
    format: "Manga",
    score: "9.7",
    statusLabel: "Watching",
    statusClass: "watching",
    cover: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=300&q=80",
  },
  {
    title: "Ping Pong the Animation",
    year: 2014,
    format: "TV Series",
    score: "8.5",
    statusLabel: "Plan to Watch",
    statusClass: "plan",
    cover: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80",
  },
  {
    title: "Monster",
    year: 2004,
    format: "TV Series",
    score: "9.4",
    statusLabel: "Completed",
    statusClass: "completed",
    cover: "https://images.unsplash.com/photo-1432821596592-e2c18b78144f?w=300&q=80",
  },
  {
    title: "Chainsaw Man",
    year: 2022,
    format: "TV Series",
    score: "8.3",
    statusLabel: "Dropped",
    statusClass: "dropped",
    cover: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=300&q=80",
  },
];

const libraryRows = [
  {
    id: "01",
    title: "Akira",
    type: "Film",
    userScore: "9",
    officialScore: "8.7",
    status: "Completed",
    progress: "1 / 1",
    date: "2025-11-12",
    cover: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=80&q=80",
    watching: false,
  },
  {
    id: "02",
    title: "Cowboy Bebop",
    type: "TV",
    userScore: "10",
    officialScore: "8.9",
    status: "Watching",
    progress: "9 / 26",
    date: "2026-01-02",
    cover: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=80&q=80",
    watching: true,
  },
  {
    id: "03",
    title: "Pluto",
    type: "Manga",
    userScore: "8",
    officialScore: "8.6",
    status: "On Hold",
    progress: "18 / 65",
    date: "2025-08-19",
    cover: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=80&q=80",
    watching: false,
  },
  {
    id: "04",
    title: "Paprika",
    type: "Film",
    userScore: "--",
    officialScore: "8.0",
    status: "Plan to Watch",
    progress: "0 / 1",
    date: "2026-02-21",
    cover: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=80&q=80",
    watching: false,
  },
];

const exploreResults = [
  {
    title: "Frieren: Beyond Journey's End",
    year: 2023,
    format: "TV Series",
    score: "9.1",
    cover: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=300&q=80",
    inLibrary: true,
  },
  {
    title: "Blue Box",
    year: 2021,
    format: "Manga",
    score: "8.4",
    cover: "https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?w=300&q=80",
    inLibrary: false,
  },
  {
    title: "Kaiju No. 8",
    year: 2020,
    format: "Manga",
    score: "8.2",
    cover: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=300&q=80",
    inLibrary: false,
  },
  {
    title: "The Apothecary Diaries",
    year: 2023,
    format: "TV Series",
    score: "8.9",
    cover: "https://images.unsplash.com/photo-1505678261036-a3fcc5e884ee?w=300&q=80",
    inLibrary: true,
  },
  {
    title: "Dandadan",
    year: 2021,
    format: "Manga",
    score: "8.6",
    cover: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=300&q=80",
    inLibrary: false,
  },
  {
    title: "Solo Leveling",
    year: 2024,
    format: "TV Series",
    score: "8.1",
    cover: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300&q=80",
    inLibrary: false,
  },
  {
    title: "Vinland Saga",
    year: 2019,
    format: "TV Series",
    score: "8.8",
    cover: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&q=80",
    inLibrary: true,
  },
  {
    title: "Witch Hat Atelier",
    year: 2016,
    format: "Manga",
    score: "8.7",
    cover: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=300&q=80",
    inLibrary: false,
  },
];

const curatedStrips = [
  {
    title: "Top Rated This Season",
    items: ["Frieren", "Dungeon Meshi", "Jujutsu Kaisen", "Apothecary Diaries", "Blue Box"],
  },
  {
    title: "All-Time Classics",
    items: ["Monster", "Bebop", "Akira", "Ghost in the Shell", "Mushishi"],
  },
  {
    title: "Manga Essentials",
    items: ["Berserk", "Vagabond", "Pluto", "Dandadan", "Blue Box"],
  },
];

const myListRows = [
  {
    id: "01",
    title: "Berserk",
    type: "Manga",
    myScore: "10",
    officialScore: "9.2",
    status: "Watching",
    statusClass: "watching",
    progress: "Ch 103 / 364",
    date: "2026-02-01",
    cover: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=80&q=80",
  },
  {
    id: "02",
    title: "Neon Genesis Evangelion",
    type: "TV",
    myScore: "9",
    officialScore: "8.3",
    status: "Completed",
    statusClass: "completed",
    progress: "Ep 26 / 26",
    date: "2025-10-11",
    cover: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=80&q=80",
  },
  {
    id: "03",
    title: "Chainsaw Man",
    type: "TV",
    myScore: "6",
    officialScore: "8.4",
    status: "Dropped",
    statusClass: "dropped",
    progress: "Ep 5 / 12",
    date: "2025-08-22",
    cover: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=80&q=80",
  },
  {
    id: "04",
    title: "Pluto",
    type: "Manga",
    myScore: "8",
    officialScore: "8.6",
    status: "On Hold",
    statusClass: "hold",
    progress: "Ch 18 / 65",
    date: "2025-12-04",
    cover: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=80&q=80",
  },
  {
    id: "05",
    title: "Ping Pong the Animation",
    type: "TV",
    myScore: "--",
    officialScore: "8.6",
    status: "Plan to Watch",
    statusClass: "plan",
    progress: "Ep 0 / 11",
    date: "2026-03-01",
    cover: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&q=80",
  },
];

const scoreDistribution = [
  { score: 10, value: 6 },
  { score: 9, value: 11 },
  { score: 8, value: 9 },
  { score: 7, value: 5 },
  { score: 6, value: 4 },
  { score: 5, value: 2 },
  { score: 4, value: 1 },
  { score: 3, value: 1 },
  { score: 2, value: 0 },
  { score: 1, value: 0 },
];

const profileStats = [
  { label: "Total Entries", value: "042" },
  { label: "Episodes Watched", value: "812" },
  { label: "Chapters Read", value: "1,942" },
  { label: "Days Consumed", value: "148" },
  { label: "Favourite Genre", value: "Seinen" },
  { label: "Mean Score", value: "8.7" },
];

const favouriteTitles = [
  "Berserk",
  "Monster",
  "Vagabond",
  "Mushishi",
  "Evangelion",
];

const libraryFilters = {
  type: ["All", "Anime", "Manga", "Films"],
  genre: ["Action", "Sci-Fi", "Seinen", "Shonen", "Horror", "Sports", "Fantasy", "Romance"],
  status: ["Watching", "Completed", "On Hold", "Dropped", "PTW"],
};

function LibraryView({
  activeView,
  setActiveView,
  activeType,
  setActiveType,
  activeGenre,
  setActiveGenre,
  activeStatus,
  setActiveStatus,
}: {
  activeView: "grid" | "list";
  setActiveView: (value: "grid" | "list") => void;
  activeType: string;
  setActiveType: (value: string) => void;
  activeGenre: string;
  setActiveGenre: (value: string) => void;
  activeStatus: string;
  setActiveStatus: (value: string) => void;
}) {
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
          <select className="sort-select" aria-label="Sort entries">
            <option>Date Added</option>
            <option>Score</option>
            <option>Title A–Z</option>
            <option>Year</option>
          </select>
        </div>
      </div>

      <div className="count-row">
        <span className="count-label">Entries</span>
        <span className="count-num">042</span>
        <span className="count-label" style={{ marginLeft: 16 }}>
          Showing
        </span>
        <span className="count-num">{String(libraryCards.length).padStart(2, "0")}</span>
      </div>

      {activeView === "grid" ? (
        <div className="grid library-grid">
          {libraryCards.map((card) => (
            <article className="card" key={`${card.title}-${card.year}`}>
              <div className="card-img-wrap">
                <img className="card-img" src={card.cover} alt={card.title} />
                <div className="card-img-overlay" />
                <div className="card-actions">
                  <button className="card-action-btn" type="button">
                    Update
                  </button>
                  <button className="card-action-btn" type="button">
                    Detail
                  </button>
                </div>
                <div className={`score-badge ${Number(card.score) >= 9 ? "gold" : ""}`}>{card.score}</div>
                <div className={`status-badge ${card.statusClass}`}>{card.statusLabel}</div>
              </div>
              <div className="card-info">
                <div className="card-title">{card.title}</div>
                <div className="card-meta">
                  <span>{card.year}</span> • {card.format}
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
          {libraryRows.map((row, index) => (
            <div
              key={row.id}
              className={`library-row ${index % 2 === 0 ? "row-alt" : ""} ${row.watching ? "row-watching" : ""}`}
            >
              <span className="mono">{row.id}</span>
              <img className="row-cover" src={row.cover} alt={row.title} />
              <span className="title-cell">{row.title}</span>
              <span className="mono">{row.type}</span>
              <span className="mono">{row.userScore}</span>
              <span className="mono">{row.officialScore}</span>
              <span className={`status-chip ${row.status.replace(/\s+/g, "-").toLowerCase()}`}>{row.status}</span>
              <span className="mono">{row.progress}</span>
              <span className="mono">{row.date}</span>
              <button className="table-action" type="button" aria-label="Edit entry">
                ✎
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ExploreView() {
  const [activeGenre, setActiveGenre] = useState("Action");
  const [activeSeason, setActiveSeason] = useState("Spring");
  const [activeStudio, setActiveStudio] = useState("Bones");
  const [activeType, setActiveType] = useState("Anime");

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
        <input className="search-input" placeholder="SEARCH TITLE, AUTHOR, STUDIO..." />
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
              onClick={() => setActiveType(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="hero-grid">
        <div
          className="hero-main"
          style={{
            backgroundImage: "url(https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80)",
          }}
        >
          <div className="hero-overlay" />
          <div className="hero-content">
            <span className="hero-stamp">Featured</span>
            <h3 className="hero-title">Dungeon Meshi</h3>
            <div className="hero-tags">
              <span className="tag">Fantasy</span>
              <span className="tag">Adventure</span>
              <span className="tag">Seinen</span>
            </div>
            <button className="hero-btn" type="button">
              + Add to Library
            </button>
          </div>
        </div>
        <div className="hero-side">
          {[
            {
              title: "Heavenly Delusion",
              tag: "Sci-Fi",
              img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&q=80",
            },
            {
              title: "Witch Hat Atelier",
              tag: "Fantasy",
              img: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=80",
            },
          ].map((item) => (
            <div className="hero-mini" key={item.title}>
              <img src={item.img} alt={item.title} />
              <div className="hero-mini-content">
                <div className="hero-mini-title">{item.title}</div>
                <div className="hero-mini-tags">
                  <span className="tag">{item.tag}</span>
                </div>
                <button className="hero-mini-btn" type="button">
                  + Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-header">
        <span className="section-title">Search Results</span>
      </div>
      <div className="grid results-grid">
        {exploreResults.map((item) => (
          <article className="card" key={`${item.title}-${item.year}`}>
            <div className="card-img-wrap">
              <img className="card-img" src={item.cover} alt={item.title} />
              <div className="card-img-overlay" />
              <div className="card-actions">
                <button
                  className={`card-action-btn ${item.inLibrary ? "in-library" : "primary"}`}
                  type="button"
                >
                  {item.inLibrary ? "In Library ✓" : "+ Add to Library"}
                </button>
              </div>
              <div className={`score-badge ${Number(item.score) >= 9 ? "gold" : ""}`}>{item.score}</div>
            </div>
            <div className="card-info">
              <div className="card-title">{item.title}</div>
              <div className="card-meta">
                <span>{item.year}</span> • {item.format}
              </div>
            </div>
          </article>
        ))}
      </div>

      {curatedStrips.map((strip) => (
        <section className="strip" key={strip.title}>
          <div className="strip-header">
            <span className="section-title">{strip.title}</span>
            <button className="strip-link" type="button">
              View All →
            </button>
          </div>
          <div className="strip-cards">
            {strip.items.map((item) => (
              <div className="strip-card" key={item}>
                <div className="strip-card-title">{item}</div>
                <div className="strip-card-tag">Curated</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function MyListView() {
  const [activeTab, setActiveTab] = useState("All");
  const tabs = ["All", "Watching", "Completed", "On Hold", "Dropped", "Plan to Watch"];

  return (
    <>
      <div className="page-header list-header">
        <div className="page-title-row">
          <span className="page-title-kanji">一覧</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">MY LIST</span>
          <span className="entries-badge">042 entries</span>
        </div>
      </div>

      <div className="stat-strip">
        {[
          { label: "Total Entries", value: "042" },
          { label: "Completed", value: "18" },
          { label: "Currently Watching", value: "06" },
          { label: "Mean Score", value: "8.7" },
        ].map((stat) => (
          <div className="stat-pill" key={stat.label}>
            <span className="stat-label">{stat.label}</span>
            <span className="stat-value">{stat.value}</span>
          </div>
        ))}
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
        {myListRows.map((row, index) => (
          <div
            className={`list-row ${index % 2 === 0 ? "row-alt" : ""} ${row.statusClass === "watching" ? "row-watching" : ""}`}
            key={row.id}
          >
            <span className="mono">{row.id}</span>
            <img className="row-cover" src={row.cover} alt={row.title} />
            <span className="title-cell">{row.title}</span>
            <span className="mono">{row.type}</span>
            <span className="score-chip">{row.myScore}</span>
            <span className="mono">{row.officialScore}</span>
            <span className={`status-chip ${row.statusClass}`}>{row.status}</span>
            <span className="progress-chip">{row.progress}</span>
            <span className="mono">{row.date}</span>
            <button className="table-action" type="button" aria-label="More actions">
              ⋯
            </button>
          </div>
        ))}
      </div>

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
        <div className="chart-panel">
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

function ProfileView() {
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
            {favouriteTitles.map((title) => (
              <div className="favourite-card" key={title}>
                <span className="favourite-title">{title}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="profile-card">
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

export default function Home() {
  const [activeNav, setActiveNav] = useState("Library");
  const [activeTab, setActiveTab] = useState("Anime");
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState("All");
  const [activeGenre, setActiveGenre] = useState("Action");
  const [activeStatus, setActiveStatus] = useState("Watching");

  const viewClass =
    activeNav === "Explore" ? "explore" : activeNav === "My List" ? "list" : activeNav === "Profile" ? "profile" : "library";

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
          <div key={activeNav} className="view-panel">
            {activeNav === "Library" ? (
              <LibraryView
                activeView={activeView}
                setActiveView={setActiveView}
                activeType={activeType}
                setActiveType={setActiveType}
                activeGenre={activeGenre}
                setActiveGenre={setActiveGenre}
                activeStatus={activeStatus}
                setActiveStatus={setActiveStatus}
              />
            ) : null}
            {activeNav === "Explore" ? <ExploreView /> : null}
            {activeNav === "My List" ? <MyListView /> : null}
            {activeNav === "Profile" ? <ProfileView /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}