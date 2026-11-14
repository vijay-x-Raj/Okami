"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import type { OkamiMedia, MediaType } from "../lib/jikan";
import {
  type OkamiEntry,
  type OkamiStatus,
  type UnifiedFranchiseEntry,
  type FranchiseItemOption,
  cleanFranchiseTitle,
  bundleFranchiseEntries,
} from "../lib/storage";
import {
  searchMedia,
  fetchTop,
  fetchTopDetailed,
  fetchSeason,
  fetchSeasonDetailed,
  prefetchMedia,
} from "../lib/api";
import {
  useDebounce,
  mediaKey,
  entryCategory,
  formatScore,
} from "../lib/libraryUtils";

export const EXPLORE_GENRES = [
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

export const SORT_OPTIONS: Array<{
  label: string;
  value: "trending" | "score" | "popular" | "newest" | "title";
}> = [
  { label: "Trending", value: "trending" },
  { label: "Top Rated", value: "score" },
  { label: "Most Popular", value: "popular" },
  { label: "Recently Added", value: "newest" },
  { label: "Title A–Z", value: "title" },
];

export const ANIME_FORMATS = [
  { label: "All Formats", value: "" },
  { label: "TV Series", value: "tv" },
  { label: "Film", value: "movie" },
  { label: "OVA / Special", value: "ova" },
];

export const MANGA_FORMATS = [
  { label: "All Formats", value: "" },
  { label: "Manga", value: "manga" },
  { label: "Light Novel", value: "novel" },
  { label: "One-Shot", value: "one_shot" },
];

export const STATUS_FILTERS = [
  { label: "All Status", value: "" },
  { label: "Airing / Publishing", value: "airing" },
  { label: "Completed", value: "finished" },
  { label: "Upcoming", value: "upcoming" },
];

export const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;

// ── Unified Explore Card Component ──
export function ExploreMediaCard({
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
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                #{String(index + 1).padStart(2, "0")}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Custom Multi-Row & Multi-Column Category Section with Slider ──
export function ExploreCategorySection({
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
          <h3 className="section-title" style={{ margin: 0 }}>
            {title}
          </h3>
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
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
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
                Page {String(batchPage).padStart(2, "0")} /{" "}
                {String(totalBatches).padStart(2, "0")}
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

export interface ExploreCategoryConfig {
  id: string;
  title: string;
  subtitle: string;
  kanji: string;
  type: MediaType;
  categoryType: "trending" | "season" | "top" | "genre" | "top-filter";
  filter?: string;
  genre?: string;
  initialItems?: OkamiMedia[];
}

// ── Dedicated Category View ──
export function DedicatedCategoryView({
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

  return (
    <div className="category-dedicated-view">
      {/* Header with Back button and metadata */}
      <div className="category-view-header">
        <button type="button" className="category-back-btn" onClick={onBack}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back to Explore</span>
        </button>

        <div className="category-view-title-block">
          <div className="category-view-eyebrow">
            <span>{category.kanji}</span>
            <span>•</span>
            <span>{category.type.toUpperCase()} SPOTLIGHT</span>
          </div>
          <h2 className="category-view-title">{category.title}</h2>
          <p className="category-view-subtitle">{category.subtitle}</p>
        </div>
      </div>

      {/* Filter matrix bar for dedicated category */}
      <div
        className="filter-bar"
        style={{
          flexWrap: "wrap",
          gap: "10px",
          padding: "10px 14px",
          marginBottom: "20px",
        }}
      >
        <div className="filter-section">
          <span className="filter-label">Format</span>
          {formatOptions.map((item) => (
            <button
              key={item.label}
              className={`pill ${activeFormat === item.value ? "active" : ""}`}
              type="button"
              onClick={() =>
                setActiveFormat(activeFormat === item.value ? "" : item.value)
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {category.categoryType === "genre" && (
          <>
            <div className="filter-divider" />
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
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <span
            className="mono"
            style={{ fontSize: "11px", color: "var(--text-3)", letterSpacing: "1px" }}
          >
            {items.length} TITLES LOADED
          </span>
        </div>
      </div>

      {/* Grid of media items */}
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

      {/* Load More Trigger */}
      {hasNextPage && (
        <div className="load-more-container">
          <button
            type="button"
            className="load-more-btn"
            onClick={() => loadPage(page + 1)}
            disabled={loading}
          >
            {loading ? "Loading More..." : "Load Next 25 Titles ▾"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Custom Interactive Full-Width Hero Slider ──
export function CustomHeroSlider({
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
          MAL {formatScore(current.official_score)} •{" "}
          {current.format || (current.type === "anime" ? "TV SERIES" : "MANGA")}
        </div>

        <h2 className="explore-hero-title">{current.title}</h2>

        <div className="explore-hero-tags">
          <span className="tag">
            {current.format || (current.type === "anime" ? "TV" : "MANGA")}
          </span>
          {current.year ? <span className="tag">{current.year}</span> : null}
          {current.genres.slice(0, 3).map((genre) => (
            <span key={genre} className="tag">
              {genre}
            </span>
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
            className="hero-btn secondary"
            type="button"
            onClick={() => onDetail(current)}
          >
            Full Details
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bundle Naming Modal ──
export function BundleNamingModal({
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
      <div
        className="folder-modal-box"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="folder-modal-header">
          <div style={{ flex: 1 }}>
            <div className="folder-modal-eyebrow">
              NEW COLLECTION FOLDER • {selectedItems.length} TITLES
            </div>
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
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--text-2)",
                }}
              >
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
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: "var(--text-2)",
                  }}
                >
                  Initial Status
                </label>
                <select
                  className="search-input"
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "8px 10px",
                    background: "var(--surface-2)",
                  }}
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
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: "var(--text-2)",
                  }}
                >
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
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Bundled Titles ({selectedItems.length})
              </div>
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
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
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-3)",
                          display: "flex",
                          gap: 8,
                          marginTop: 2,
                        }}
                      >
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

// ── Explore View ──
export function ExploreView({
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
  const [activeSort, setActiveSort] = useState<
    "trending" | "score" | "popular" | "newest" | "title"
  >("trending");
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeFormat, setActiveFormat] = useState("");
  const [activeSeason, setActiveSeason] = useState("");
  const [activeStatus, setActiveStatus] = useState("");

  const [activeCategoryView, setActiveCategoryView] =
    useState<ExploreCategoryConfig | null>(null);
  const [loadingBatchCategory, setLoadingBatchCategory] = useState<string | null>(null);

  // Multi-Select Catalog State & Bundle Modal
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedCatalogMap, setSelectedCatalogMap] = useState<Map<number, OkamiMedia>>(
    new Map()
  );
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
    setBundleInitialTitle(
      defaultTitle ? `${defaultTitle} Series` : `${primaryItem.title} Collection`
    );
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

    const finalTitle =
      customTitle.trim() || `${cleanFranchiseTitle(primaryItem.title)} Collection`;

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
      if (
        trendingAnime.length === 0 &&
        seasonal.length === 0 &&
        topAnime.length === 0 &&
        topManga.length === 0
      ) {
        setLoadingTop(true);
      }
      setTopError(false);
    });

    // Fast-path: Load trending & top seasonal/anime first to display content instantly (~200ms)
    Promise.all([
      searchMedia("anime", "", { sort: "trending", limit: 50 })
        .then((r) => r.data)
        .catch(() => []),
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
      searchMedia("anime", "", { genres: "Action", limit: 50 })
        .then((r) => r.data)
        .catch(() => []),
      searchMedia("anime", "", { genres: "Psychological", limit: 50 })
        .then((r) => r.data)
        .catch(() => []),
    ]).then(([movieData, actAnimeData, psychData]) => {
      if (!active) return;
      setTopMovies(movieData);
      setActionAnime(actAnimeData);
      setPsychAnime(psychData);
    });

    // Stream in manga categories (including trending manga)
    Promise.all([
      searchMedia("manga", "", { sort: "trending", limit: 50 })
        .then((r) => r.data)
        .catch(() => []),
      fetchTop("manga", { limit: 50 }).catch(() => []),
      fetchTop("manga", { filter: "novels", limit: 50 }).catch(() => []),
      searchMedia("manga", "", { genres: "Action", limit: 50 })
        .then((r) => r.data)
        .catch(() => []),
      searchMedia("manga", "", { genres: "Romance", limit: 50 })
        .then((r) => r.data)
        .catch(() => []),
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
  }, [
    trendingAnime.length,
    trendingManga.length,
    seasonal.length,
    topAnime.length,
    topManga.length,
  ]);

  const loadMoreBatches = async (catId: string) => {
    if (loadingBatchCategory) return;
    setLoadingBatchCategory(catId);
    try {
      if (catId === "trendingAnime") {
        const nextPage = Math.floor(trendingAnime.length / 25) + 1;
        const res = await searchMedia("anime", "", {
          sort: "trending",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !trendingAnime.some((s) => s.id === m.id)
        );
        setTrendingAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "trendingManga") {
        const nextPage = Math.floor(trendingManga.length / 25) + 1;
        const res = await searchMedia("manga", "", {
          sort: "trending",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !trendingManga.some((s) => s.id === m.id)
        );
        setTrendingManga((prev) => [...prev, ...newItems]);
      } else if (catId === "seasonal") {
        const nextPage = Math.floor(seasonal.length / 25) + 1;
        const res = await fetchSeasonDetailed({ page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter(
          (m) => !seasonal.some((s) => s.id === m.id)
        );
        setSeasonal((prev) => [...prev, ...newItems]);
      } else if (catId === "topAnime") {
        const nextPage = Math.floor(topAnime.length / 25) + 1;
        const res = await fetchTopDetailed("anime", { page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter(
          (m) => !topAnime.some((s) => s.id === m.id)
        );
        setTopAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "topManga") {
        const nextPage = Math.floor(topManga.length / 25) + 1;
        const res = await fetchTopDetailed("manga", { page: nextPage, limit: 30 });
        const newItems = (res.data || []).filter(
          (m) => !topManga.some((s) => s.id === m.id)
        );
        setTopManga((prev) => [...prev, ...newItems]);
      } else if (catId === "topNovels") {
        const nextPage = Math.floor(topNovels.length / 25) + 1;
        const res = await fetchTopDetailed("manga", {
          filter: "novels",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !topNovels.some((s) => s.id === m.id)
        );
        setTopNovels((prev) => [...prev, ...newItems]);
      } else if (catId === "actionAnime") {
        const nextPage = Math.floor(actionAnime.length / 25) + 1;
        const res = await searchMedia("anime", "", {
          genres: "Action",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !actionAnime.some((s) => s.id === m.id)
        );
        setActionAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "actionManga") {
        const nextPage = Math.floor(actionManga.length / 25) + 1;
        const res = await searchMedia("manga", "", {
          genres: "Action",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !actionManga.some((s) => s.id === m.id)
        );
        setActionManga((prev) => [...prev, ...newItems]);
      } else if (catId === "psychAnime") {
        const nextPage = Math.floor(psychAnime.length / 25) + 1;
        const res = await searchMedia("anime", "", {
          genres: "Psychological",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !psychAnime.some((s) => s.id === m.id)
        );
        setPsychAnime((prev) => [...prev, ...newItems]);
      } else if (catId === "romanceManga") {
        const nextPage = Math.floor(romanceManga.length / 25) + 1;
        const res = await searchMedia("manga", "", {
          genres: "Romance",
          page: nextPage,
          limit: 30,
        });
        const newItems = (res.data || []).filter(
          (m) => !romanceManga.some((s) => s.id === m.id)
        );
        setRomanceManga((prev) => [...prev, ...newItems]);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBatchCategory(null);
    }
  };

  useEffect(() => {
    loadDiscovery();
  }, [loadDiscovery]);

  useEffect(() => {
    if (!isSearchMode) {
      setResults([]);
      setTotalResults(null);
      setHasNextPage(false);
      return;
    }

    let active = true;

    Promise.resolve().then(() => {
      if (active) setLoadingSearch(true);
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

  return (
    <div className={`explore-view ${activeType === "manga" ? "theme-manga" : "theme-anime"}`}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">探索</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">EXPLORE</span>
          <div
            className="view-toggle"
            style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}
          >
            {/* Multi-Select Catalog Mode Toggle */}
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
        <div className="page-sub">
          Discover trending masterworks, seasonal broadcasts, and uncover hidden gems
        </div>
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
      <div
        className="filter-bar"
        style={{ flexWrap: "wrap", gap: "10px", padding: "10px 14px", marginBottom: "20px" }}
      >
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

          <button
            type="button"
            className="clear-all-btn"
            onClick={handleResetFilters}
            title="Reset all filters and query"
          >
            Clear All Filters ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
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
            {/* 1. Full-Width Interactive Hero Spotlight Slider */}
            {loadingTop && spotlights.length === 0 ? (
              <div className="skeleton-hero" style={{ height: 380, borderRadius: 6, marginBottom: 28 }}>
                <div className="skeleton skeleton-img" style={{ width: "100%", height: "100%" }} />
              </div>
            ) : topError ? (
              <div className="error-banner">
                <span>Failed to load discovery feed. Please check your connection.</span>
                <button className="error-retry" type="button" onClick={loadDiscovery}>
                  Retry
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

                {/* Category 04: Feature Films & Specials */}
                <ExploreCategorySection
                  title="Feature Films & Cinematic Specials"
                  items={topMovies}
                  entryMap={entryMap}
                  onAdd={onAdd}
                  onDetail={onDetail}
                  isMultiSelect={isMultiSelect}
                  selectedCatalogMap={selectedCatalogMap}
                  onToggleCatalogItem={handleToggleCatalogItem}
                />

                {/* Category 05: High-Octane Action & Shonen */}
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

                {/* Category 06: Psychological & Dark Seinen */}
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

                {/* Category 03: Light Novels & Web Serials */}
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

                {/* Category 04: Action & Dark Fantasy Manga */}
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

                {/* Category 05: Romance & Character-Driven Manga */}
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
              <h3 className="section-title" style={{ margin: 0 }}>
                Search Results
              </h3>
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
