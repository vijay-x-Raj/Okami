"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { JikanCharacter, OkamiMedia } from "@/app/lib/jikan";
import { fetchCharacters, fetchDetail } from "@/app/lib/api";
import { addEntry, loadEntries, saveEntries, type OkamiEntry, type OkamiStatus } from "@/app/lib/storage";

const DEFAULT_STATUS: OkamiStatus = "plan_to_watch";

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
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());

  const entry = useMemo(
    () => entries.find((item) => item.id === animeId && item.type === "anime"),
    [entries, animeId]
  );

  const handleAdd = () => {
    if (!media || entry) return;
    const next = addEntry(entries, buildEntry(media));
    saveEntries(next);
    setEntries(next);
  };

  useEffect(() => {
    if (!Number.isFinite(animeId)) return;

    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setMedia(null);
      setCharacters([]);
    });

    const load = async () => {
      try {
        const [detail, cast] = await Promise.all([fetchDetail("anime", animeId), fetchCharacters(animeId)]);
        if (!active) return;
        setMedia(detail);
        setCharacters(cast);
      } catch {
        if (!active) return;
        setMedia(null);
        setCharacters([]);
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

  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <Link className="back-link" href="/">
          Back to Library
        </Link>
        {media ? <span className="detail-page-id">MAL #{media.id}</span> : null}
      </div>

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
                <div className="detail-meta">
                  <span>{media.year || "--"}</span>
                  <span>•</span>
                  <span>{media.format}</span>
                  <span>•</span>
                  <span>{media.total ? `${media.total} eps` : "Ongoing"}</span>
                </div>
                <div className="detail-tags">
                  {media.genres.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="detail-page-actions">
              <button className="modal-btn primary" type="button" onClick={handleAdd} disabled={Boolean(entry)}>
                {entry ? "In Library" : "Add to Library"}
              </button>
              {entry ? (
                <Link className="modal-btn ghost" href={`/anime/${media.id}`}>
                  Open Tracker
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

      <div className="detail-card detail-synopsis-card">
        {loading ? (
          <div className="detail-empty">Loading synopsis…</div>
        ) : !media ? (
          <div className="detail-empty">Synopsis unavailable.</div>
        ) : (
          <>
            <div className="detail-section-title">Synopsis</div>
            <p className="detail-synopsis">{media.synopsis || "No synopsis yet."}</p>
          </>
        )}
      </div>

      <div className="detail-lower-grid">
        <div className="detail-card detail-info-card">
          <div className="detail-info-body">
            <div className="detail-section">
              <div className="detail-section-title">Overview</div>
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
                    <span className="info-value">{media.studios?.[0] || "--"}</span>
                  </div>
                </div>
              ) : (
                <div className="detail-empty">Overview unavailable.</div>
              )}
            </div>
          </div>
        </div>

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
                  {characters.slice(0, 12).map((character) => (
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
    </div>
  );
}
