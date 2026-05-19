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

const typeFilters = ["All", "Anime", "Manga", "Films"];
const genreFilters = ["Action", "Sci-Fi", "Seinen", "Shonen", "Horror", "Sports", "Fantasy", "Romance"];
const statusFilters = ["Watching", "Completed", "On Hold", "Dropped", "PTW"];

const cards = [
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

export default function Home() {
  const [activeNav, setActiveNav] = useState("Library");
  const [activeTab, setActiveTab] = useState("Anime");
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState("All");
  const [activeGenre, setActiveGenre] = useState("Action");
  const [activeStatus, setActiveStatus] = useState("Watching");

  const totalEntries = 42;
  const showing = cards.length;

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

        <div className="content content-area-bg">
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
              {typeFilters.map((item) => (
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
              {genreFilters.map((item) => (
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
              {statusFilters.map((item) => (
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
            <span className="count-num">{String(totalEntries).padStart(3, "0")}</span>
            <span className="count-label" style={{ marginLeft: 16 }}>
              Showing
            </span>
            <span className="count-num">{String(showing).padStart(2, "0")}</span>
          </div>

          <div className="grid">
            {cards.map((card) => (
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
        </div>
      </main>
    </div>
  );
}
