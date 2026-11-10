"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FranchiseGraph, JikanCharacter, JikanRelation, OkamiMedia } from "@/app/lib/jikan";
import { fetchCharacters, fetchDetail, fetchFranchiseGraph, fetchRelated } from "@/app/lib/api";
import {
  addEntry,
  loadEntries,
  saveEntries,
  updateEntry,
  type OkamiEntry,
  type OkamiStatus,
} from "@/app/lib/storage";

const DEFAULT_STATUS: OkamiStatus = "plan_to_watch";
const STATUS_OPTIONS: Array<{ value: OkamiStatus; label: string }> = [
  { value: "watching", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_watch", label: "Plan to Read" },
];

function buildMangaEntry(media: OkamiMedia): OkamiEntry {
  return {
    id: media.id,
    type: "manga",
    title: media.title,
    cover: media.cover,
    year: media.year,
    format: media.format,
    genres: media.genres,
    official_score: media.official_score,
    user_score: null,
    status: DEFAULT_STATUS,
    progress: 0,
    total: media.total ?? null,
    completed_seasons: [],
    completed_volumes: [],
    completed_episodes: [],
    date_added: new Date().toISOString(),
    notes: media.synopsis ?? "",
    is_favourite: false,
  };
}

export default function MangaInfoPage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const mangaId = rawId ? Number(rawId) : Number.NaN;

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());

  const entry = useMemo(
    () => entries.find((item) => item.id === mangaId && item.type === "manga"),
    [entries, mangaId]
  );

  const [media, setMedia] = useState<OkamiMedia | null>(() => {
    const all = loadEntries();
    const found = all.find((item) => item.id === mangaId && item.type === "manga");
    if (found) {
      return {
        id: found.id,
        type: "manga",
        title: found.title,
        cover: found.cover,
        year: found.year,
        format: found.format,
        genres: found.genres || [],
        official_score: found.official_score,
        total: found.total,
        synopsis: found.notes || "",
      };
    }
    return null;
  });
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [relatedList, setRelatedList] = useState<JikanRelation[]>([]);
  const [loading, setLoading] = useState<boolean>(() => {
    const all = loadEntries();
    return !all.some((item) => item.id === mangaId && item.type === "manga");
  });

  // Personal review & notes editor
  const [userScore, setUserScore] = useState<number | null>(null);
  const [userNotes, setUserNotes] = useState<string>("");
  const [userStatus, setUserStatus] = useState<OkamiStatus>(DEFAULT_STATUS);

  useEffect(() => {
    if (entry) {
      Promise.resolve().then(() => {
        setUserScore(entry.user_score);
        setUserNotes(entry.notes || "");
        setUserStatus(entry.status);
      });
    }
  }, [entry]);

  const commitEntries = (next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const handleAdd = () => {
    if (!media || entry) return;
    const next = addEntry(entries, buildMangaEntry(media));
    commitEntries(next);
  };

  const handleSaveNotes = () => {
    if (!entry && media) {
      const nextEntry = {
        ...buildMangaEntry(media),
        user_score: userScore,
        notes: userNotes,
        status: userStatus,
      };
      commitEntries(addEntry(entries, nextEntry));
    } else if (entry) {
      commitEntries(
        updateEntry(entries, mangaId, "manga", {
          user_score: userScore,
          notes: userNotes,
          status: userStatus,
        })
      );
    }
  };

  useEffect(() => {
    if (!Number.isFinite(mangaId)) return;

    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      if (!entry) {
        setLoading(true);
        setMedia(null);
      }
      setCharacters([]);
      setFranchiseGraph(null);
      setRelatedList([]);
    });

    const load = async () => {
      // 1. Fetch primary detail first and render hero/synopsis immediately
      try {
        const detail = await fetchDetail("manga", mangaId);
        if (!active) return;
        setMedia(detail);
        setLoading(false);
      } catch {
        if (!active) return;
        setLoading(false);
      }

      // 2. Stream in franchise relations and cast concurrently in background
      fetchFranchiseGraph(mangaId, "manga")
        .then((graph) => {
          if (active && graph) setFranchiseGraph(graph);
        })
        .catch(() => {});

      fetchRelated("manga", mangaId)
        .then((related) => {
          if (active && related) setRelatedList(related);
        })
        .catch(() => {});

      fetchCharacters(mangaId, "manga")
        .then((cast) => {
          if (active && cast) setCharacters(cast);
        })
        .catch(() => {});
    };

    load();

    return () => {
      active = false;
    };
  }, [mangaId, entry]);

  const allSeasons = useMemo(() => franchiseGraph?.seasons ?? [], [franchiseGraph]);
  const allExtras = useMemo(() => franchiseGraph?.extras ?? [], [franchiseGraph]);
  const linkedAnime = allSeasons[0] ?? allExtras[0] ?? null;

  const { relatedAnime, relatedManga } = useMemo(() => {
    const existingAnimeIds = new Set([
      ...allSeasons.map((s) => s.malId),
      ...allExtras.map((e) => e.malId),
    ]);
    const existingMangaIds = new Set([mangaId]);

    const animes: Array<{ mal_id: number; name: string; relation: string }> = [];
    const mangas: Array<{ mal_id: number; name: string; relation: string }> = [];

    for (const group of relatedList) {
      const rel = group.relation || "Related";
      for (const item of group.entry || []) {
        if (item.type === "anime") {
          if (!existingAnimeIds.has(item.mal_id)) {
            existingAnimeIds.add(item.mal_id);
            animes.push({ mal_id: item.mal_id, name: item.name || "Untitled", relation: rel });
          }
        } else if (item.type === "manga") {
          if (!existingMangaIds.has(item.mal_id)) {
            existingMangaIds.add(item.mal_id);
            mangas.push({ mal_id: item.mal_id, name: item.name || "Untitled", relation: rel });
          }
        }
      }
    }

    return { relatedAnime: animes, relatedManga: mangas };
  }, [relatedList, mangaId, allSeasons, allExtras]);

  if (!Number.isFinite(mangaId)) {
    return (
      <div className="detail-page">
        <div className="detail-page-header">
          <Link className="back-link" href="/">
            Back to Library
          </Link>
        </div>
        <div className="detail-card">
          <div className="detail-title">Invalid manga id.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="back-link" href="/">
            ← Back to Library
          </Link>
          {media ? <span className="detail-page-id">MAL Manga #{media.id}</span> : null}
          <Link className="adaptation-pill manga-link" href={`/manga/${mangaId}`}>
            Open Interactive Manga Tracker →
          </Link>
        </div>
        {linkedAnime ? (
          <Link className="adaptation-pill anime-link" href={`/anime/${linkedAnime.malId}/info`}>
            Anime Adaptation: {linkedAnime.title} →
          </Link>
        ) : null}
      </div>

      {/* Hero Card */}
      <div className="detail-card detail-hero-card">
        {loading ? (
          <div className="detail-empty">Loading manga details…</div>
        ) : !media ? (
          <div className="detail-empty">Manga details unavailable.</div>
        ) : (
          <>
            <div className="detail-hero">
              <img className="detail-hero-cover" src={media.cover} alt={media.title} />
              <div>
                <div className="detail-title">{media.title}</div>
                {media.title_english && media.title_english !== media.title && (
                  <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>
                    {media.title_english}
                  </div>
                )}
                <div className="detail-meta">
                  <span>{media.year || "--"}</span>
                  <span>•</span>
                  <span>{media.format}</span>
                  <span>•</span>
                  <span>
                    {media.chapters ? `${media.chapters} chs` : "Ongoing chapters"}
                    {media.volumes ? ` / ${media.volumes} vols` : ""}
                  </span>
                  {media.authors && media.authors.length > 0 ? (
                    <>
                      <span>•</span>
                      <span>By {media.authors.join(", ")}</span>
                    </>
                  ) : null}
                  {media.rank ? (
                    <>
                      <span>•</span>
                      <span className="accent-text">Rank #{media.rank}</span>
                    </>
                  ) : null}
                </div>
                <div className="detail-tags">
                  {media.genres.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                  {media.themes?.map((t) => (
                    <span className="tag" key={t} style={{ borderColor: "var(--teal)", color: "var(--teal)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="detail-page-actions">
              <button
                className="modal-btn primary"
                type="button"
                onClick={handleAdd}
                disabled={Boolean(entry)}
              >
                {entry ? "In Library ✓" : "+ Add to Library"}
              </button>
              <Link className="modal-btn ghost" href={`/manga/${media.id}`}>
                Track Chapters & Volumes
              </Link>
              {linkedAnime ? (
                <Link className="modal-btn ghost" href={`/anime/${linkedAnime.malId}`}>
                  Watch Anime Adaptation
                </Link>
              ) : null}
              <span className="detail-score">
                <span className="detail-score-label">MAL Score</span>
                <span className="detail-score-value">
                  {media.official_score ? media.official_score.toFixed(1) : "--"}
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Synopsis Card */}
      <div className="detail-card detail-synopsis-card">
        {loading ? (
          <div className="detail-empty">Loading synopsis…</div>
        ) : !media ? (
          <div className="detail-empty">Synopsis unavailable.</div>
        ) : (
          <>
            <div className="detail-section-title">Synopsis</div>
            <p className="detail-synopsis">{media.synopsis || "No synopsis available."}</p>
          </>
        )}
      </div>

      {/* Franchise Universe & Related Series (Prominently Placed Below Synopsis) */}
      {(allSeasons.length > 0 ||
        allExtras.length > 0 ||
        relatedAnime.length > 0 ||
        relatedManga.length > 0) && (
        <div className="detail-card" style={{ marginBottom: 16 }}>
          <div className="detail-section">
            <div className="detail-section-title">Related Manga &amp; Anime Adaptations</div>

            {/* ── Section 1: MANGA PUBLICATIONS & RELATED ── */}
            <div className="franchise-section-divider">
              <span className="franchise-section-badge manga">Manga Publications</span>
              <span className="franchise-section-count">
                {1 + relatedManga.length} Titles
              </span>
            </div>

            {/* Current Manga */}
            {media && (
              <div style={{ marginBottom: 16 }}>
                <div className="franchise-group-title">Current Manga Series</div>
                <div className="franchise-node-item current">
                  <img className="franchise-node-thumb" src={media.cover} alt={media.title} />
                  <div style={{ flex: 1 }}>
                    <div className="franchise-node-title">{media.title}</div>
                    <div className="franchise-node-sub">
                      {media.format} • {media.year || "--"}
                      {media.chapters ? ` • ${media.chapters} chapters` : ""}
                    </div>
                  </div>
                  <span className="franchise-node-active-pill">CURRENT</span>
                </div>
              </div>
            )}

            {/* Related Manga & Light Novels */}
            {relatedManga.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="franchise-group-title">Related Manga &amp; Light Novels</div>
                <div className="franchise-nodes-list">
                  {relatedManga.map((item) => (
                    <div className="franchise-node-item" key={`${item.relation}-${item.mal_id}`}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span className={`relation-chip ${item.relation.toLowerCase().replace(/\s+/g, "-")}`}>
                            {item.relation}
                          </span>
                          <span className="franchise-node-title">{item.name}</span>
                        </div>
                      </div>
                      <Link
                        className="franchise-node-action manga"
                        href={`/manga/${item.mal_id}/info`}
                        title={`View ${item.name}`}
                      >
                        View Manga →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 2: ANIME ADAPTATIONS ── */}
            <div className="franchise-section-divider" style={{ marginTop: 24 }}>
              <span className="franchise-section-badge anime">Anime Adaptations</span>
              <span className="franchise-section-count">
                {allSeasons.length + allExtras.length + relatedAnime.length} Titles
              </span>
            </div>

            {/* Mainline TV Seasons */}
            {allSeasons.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="franchise-group-title">Mainline TV Seasons</div>
                <div className="franchise-nodes-list">
                  {allSeasons.map((season) => (
                    <div className="franchise-node-item" key={season.malId}>
                      <img className="franchise-node-thumb" src={season.cover} alt={season.title} />
                      <div style={{ flex: 1 }}>
                        <div className="franchise-node-title">
                          S{season.seasonNumber}: {season.title}
                        </div>
                        <div className="franchise-node-sub">
                          {season.year || "--"} • {season.episodes ? `${season.episodes} eps` : "Ongoing"}
                        </div>
                      </div>
                      <Link className="franchise-node-action" href={`/anime/${season.malId}/info`}>
                        View Anime →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Theatrical Movies & Specials */}
            {allExtras.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="franchise-group-title">Theatrical Movies &amp; Specials</div>
                <div className="franchise-nodes-list">
                  {allExtras.map((extra) => (
                    <div className="franchise-node-item" key={extra.malId}>
                      <img className="franchise-node-thumb" src={extra.cover} alt={extra.title} />
                      <div style={{ flex: 1 }}>
                        <div className="franchise-node-title">{extra.title}</div>
                        <div className="franchise-node-sub">
                          {extra.type} • {extra.year || "--"}
                        </div>
                      </div>
                      <Link className="franchise-node-action" href={`/anime/${extra.malId}/info`}>
                        View Anime →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Anime Series */}
            {relatedAnime.length > 0 && (
              <div>
                <div className="franchise-group-title">Related Anime Series</div>
                <div className="franchise-nodes-list">
                  {relatedAnime.map((item) => (
                    <div className="franchise-node-item" key={`${item.relation}-${item.mal_id}`}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span className={`relation-chip ${item.relation.toLowerCase().replace(/\s+/g, "-")}`}>
                            {item.relation}
                          </span>
                          <span className="franchise-node-title">{item.name}</span>
                        </div>
                      </div>
                      <Link
                        className="franchise-node-action"
                        href={`/anime/${item.mal_id}/info`}
                        title={`View ${item.name}`}
                      >
                        View Anime →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lower Grid: Details, Personal Notes & Characters */}
      <div className="detail-lower-grid">
        {/* Left Column: Details & Personal Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="detail-card detail-info-card">
            <div className="detail-info-body">
              <div className="detail-section">
                <div className="detail-section-title">Manga Information</div>
                {media ? (
                  <div className="detail-info-grid">
                    <div className="info-item">
                      <span className="info-label">Format</span>
                      <span className="info-value">{media.format}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Chapters</span>
                      <span className="info-value">{media.chapters ? String(media.chapters) : "Ongoing"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Volumes</span>
                      <span className="info-value">{media.volumes ? String(media.volumes) : "Ongoing"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Year Published</span>
                      <span className="info-value">{media.year || "--"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Status</span>
                      <span className="info-value">{media.status || "--"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Popularity</span>
                      <span className="info-value">{media.popularity ? `#${media.popularity}` : "--"}</span>
                    </div>
                    {media.authors && media.authors.length > 0 ? (
                      <div className="info-item" style={{ gridColumn: "1 / -1" }}>
                        <span className="info-label">Author(s)</span>
                        <span className="info-value">{media.authors.join(", ")}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* User Review & Personal Notes Card */}
          <div className="detail-card detail-info-card">
            <div className="detail-info-body">
              <div className="detail-section">
                <div className="detail-section-title">Personal Reading Log & Rating</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
                      Reading Status
                    </label>
                    <div className="status-button-row">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`status-button status-${opt.value.replace(/_/g, "-")} ${userStatus === opt.value ? "active" : ""}`}
                          onClick={() => setUserStatus(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
                      Your Score (1–10)
                    </label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`pill ${userScore === num ? "active" : ""}`}
                          style={{ minWidth: 32, textAlign: "center" }}
                          onClick={() => setUserScore(userScore === num ? null : num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
                      Reading Notes & Highlights
                    </label>
                    <textarea
                      className="search-input"
                      rows={4}
                      style={{ width: "100%", resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
                      placeholder="Track volume notes, character theories, favorite chapters..."
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                    />
                  </div>

                  <button
                    className="modal-btn primary"
                    type="button"
                    style={{ alignSelf: "flex-start", marginTop: 4 }}
                    onClick={handleSaveNotes}
                  >
                    Save Notes & Rating
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Characters */}
        <div className="detail-card detail-info-card">
          <div className="detail-info-body custom-scroll">
            <div className="detail-section">
              <div className="detail-section-title">Characters</div>
              {loading ? (
                <div className="detail-empty">Loading characters…</div>
              ) : characters.length === 0 ? (
                <div className="detail-empty">No character data available.</div>
              ) : (
                <div className="cast-list">
                  {characters.slice(0, 16).map((character) => (
                    <div className="cast-card" key={character.id || character.name}>
                      <div className="cast-character">
                        {character.image ? (
                          <img className="cast-avatar" src={character.image} alt={character.name} />
                        ) : (
                          <div className="cast-avatar fallback">{character.name.slice(0, 1)}</div>
                        )}
                        <div>
                          <div className="cast-name">{character.name}</div>
                          <div className="cast-role">{character.role || "Character"}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
