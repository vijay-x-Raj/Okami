"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FranchiseGraph, JikanCharacter, OkamiMedia } from "@/app/lib/jikan";
import { fetchCharacters, fetchDetail, fetchFranchiseGraph } from "@/app/lib/api";
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
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_watch", label: "Plan to Watch" },
];

function buildEntry(media: OkamiMedia): OkamiEntry {
  return {
    id: media.id,
    type: "anime",
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

export default function AnimeInfoPage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const animeId = rawId ? Number(rawId) : Number.NaN;

  const [media, setMedia] = useState<OkamiMedia | null>(null);
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());

  // Personal score & notes editor
  const [userScore, setUserScore] = useState<number | null>(null);
  const [userNotes, setUserNotes] = useState<string>("");
  const [userStatus, setUserStatus] = useState<OkamiStatus>(DEFAULT_STATUS);
  const [showTrailerModal, setShowTrailerModal] = useState(false);

  const entry = useMemo(
    () => entries.find((item) => item.id === animeId && item.type === "anime"),
    [entries, animeId]
  );

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
    const next = addEntry(entries, buildEntry(media));
    commitEntries(next);
  };

  const handleSaveNotes = () => {
    if (!entry && media) {
      const nextEntry = {
        ...buildEntry(media),
        user_score: userScore,
        notes: userNotes,
        status: userStatus,
      };
      commitEntries(addEntry(entries, nextEntry));
    } else if (entry) {
      commitEntries(
        updateEntry(entries, animeId, "anime", {
          user_score: userScore,
          notes: userNotes,
          status: userStatus,
        })
      );
    }
  };

  useEffect(() => {
    if (!Number.isFinite(animeId)) return;

    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setMedia(null);
      setCharacters([]);
      setFranchiseGraph(null);
    });

    const load = async () => {
      try {
        const [detail, cast, graph] = await Promise.all([
          fetchDetail("anime", animeId),
          fetchCharacters(animeId, "anime").catch(() => []),
          fetchFranchiseGraph(animeId, "anime").catch(() => null),
        ]);
        if (!active) return;
        setMedia(detail);
        setCharacters(cast);
        setFranchiseGraph(graph);
      } catch {
        if (!active) return;
        setMedia(null);
        setCharacters([]);
        setFranchiseGraph(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [animeId]);

  if (!Number.isFinite(animeId)) {
    return (
      <div className="detail-page">
        <div className="detail-page-header">
          <Link className="back-link" href="/">
            Back to Library
          </Link>
        </div>
        <div className="detail-card">
          <div className="detail-title">Invalid anime id.</div>
        </div>
      </div>
    );
  }

  const linkedManga = franchiseGraph?.adaptations?.[0] ?? null;

  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="back-link" href="/">
            ← Back to Library
          </Link>
          {media ? <span className="detail-page-id">MAL #{media.id}</span> : null}
          <Link className="adaptation-pill anime-link" href={`/anime/${animeId}`}>
            📺 Open Interactive Episode Tracker →
          </Link>
        </div>
        {linkedManga ? (
          <Link className="adaptation-pill manga-link" href={`/manga/${linkedManga.malId}/info`}>
            📖 Manga Adaptation: {linkedManga.title} →
          </Link>
        ) : null}
      </div>

      {/* Hero Card */}
      <div className="detail-card detail-hero-card">
        {loading ? (
          <div className="detail-empty">Loading anime details…</div>
        ) : !media ? (
          <div className="detail-empty">Anime details unavailable.</div>
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
                  <span>{media.total ? `${media.total} eps` : "Ongoing"}</span>
                  {media.studios && media.studios.length > 0 ? (
                    <>
                      <span>•</span>
                      <span>{media.studios.join(", ")}</span>
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
              <Link className="modal-btn ghost" href={`/anime/${media.id}`}>
                Track Episodes
              </Link>
              {media.trailer_url && (
                <button
                  className="modal-btn ghost"
                  type="button"
                  onClick={() => setShowTrailerModal(true)}
                >
                  ▶ Watch Trailer
                </button>
              )}
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

      {/* Lower Grid: Metadata, Streaming, Personal Notes & Cast */}
      <div className="detail-lower-grid">
        {/* Left Column: Metadata & Notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="detail-card detail-info-card">
            <div className="detail-info-body">
              <div className="detail-section">
                <div className="detail-section-title">Details & Streaming</div>
                {media ? (
                  <div className="detail-info-grid">
                    <div className="info-item">
                      <span className="info-label">Format</span>
                      <span className="info-value">{media.format}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Episodes</span>
                      <span className="info-value">{media.total ? String(media.total) : "Ongoing"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Year</span>
                      <span className="info-value">{media.year || "--"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Studio</span>
                      <span className="info-value">{media.studios?.join(", ") || "--"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Status</span>
                      <span className="info-value">{media.status || "--"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Popularity</span>
                      <span className="info-value">{media.popularity ? `#${media.popularity}` : "--"}</span>
                    </div>
                  </div>
                ) : null}

                {/* Streaming Links */}
                {media?.streaming && media.streaming.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="info-label" style={{ marginBottom: 8 }}>Official Streaming</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {media.streaming.map((item) => (
                        <a
                          key={item.url}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pill"
                          style={{ fontSize: 11 }}
                        >
                          {item.name} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* User Review & Personal Notes Card */}
          <div className="detail-card detail-info-card">
            <div className="detail-info-body">
              <div className="detail-section">
                <div className="detail-section-title">Personal Log & Rating</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
                      Watch Status
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
                          ★ {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
                      Private Notes
                    </label>
                    <textarea
                      className="search-input"
                      rows={4}
                      style={{ width: "100%", resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
                      placeholder="Write your impressions, arc notes, or favorite moments..."
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

        {/* Right Column: Characters & Voice Actors */}
        <div className="detail-card detail-info-card">
          <div className="detail-info-body custom-scroll">
            <div className="detail-section">
              <div className="detail-section-title">Characters & Voice Actors</div>
              {loading ? (
                <div className="detail-empty">Loading cast…</div>
              ) : characters.length === 0 ? (
                <div className="detail-empty">No cast data available.</div>
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
                      <div className="cast-actors">
                        {character.voiceActors.length === 0 ? (
                          <div className="cast-empty">No voice actor listed.</div>
                        ) : (
                          character.voiceActors.slice(0, 2).map((actor, index) => (
                            <div className="cast-actor" key={`${character.id}-va-${index}`}>
                              {actor.image ? (
                                <img className="cast-avatar" src={actor.image} alt={actor.name} />
                              ) : (
                                <div className="cast-avatar fallback">{actor.name.slice(0, 1)}</div>
                              )}
                              <div>
                                <div className="cast-name">{actor.name}</div>
                                <div className="cast-role">{actor.language || "Voice Actor"}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trailer Modal */}
      {showTrailerModal && media?.trailer_url && (
        <div className="modal-backdrop" onClick={() => setShowTrailerModal(false)}>
          <div
            className="modal-box"
            style={{ maxWidth: 800, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">Official Trailer — {media.title}</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowTrailerModal(false)}
              >
                ✕
              </button>
            </div>
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
              <iframe
                src={media.trailer_url}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
