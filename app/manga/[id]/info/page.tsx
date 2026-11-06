"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FranchiseGraph, JikanCharacter, OkamiMedia } from "@/app/lib/jikan";
import { fetchCharacters, fetchDetail, fetchFranchiseGraph } from "@/app/lib/api";
import { addEntry, loadEntries, saveEntries, type OkamiEntry } from "@/app/lib/storage";

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
    status: "plan_to_watch",
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

  const [media, setMedia] = useState<OkamiMedia | null>(null);
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());

  const entry = useMemo(
    () => entries.find((item) => item.id === mangaId && item.type === "manga"),
    [entries, mangaId]
  );

  const handleAdd = () => {
    if (!media || entry) return;
    const next = addEntry(entries, buildMangaEntry(media));
    saveEntries(next);
    setEntries(next);
  };

  useEffect(() => {
    if (!Number.isFinite(mangaId)) return;

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
          fetchDetail("manga", mangaId),
          fetchCharacters(mangaId).catch(() => []),
          fetchFranchiseGraph(mangaId, "manga").catch(() => null),
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
  }, [mangaId]);

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

  const linkedAnime = franchiseGraph?.seasons?.[0] ?? franchiseGraph?.extras?.[0] ?? null;

  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="back-link" href="/">
            ← Back to Library
          </Link>
          {media ? <span className="detail-page-id">MAL Manga #{media.id}</span> : null}
        </div>
        {linkedAnime ? (
          <Link className="adaptation-pill anime-link" href={`/anime/${linkedAnime.malId}/info`}>
            📺 Anime Adaptation: {linkedAnime.title} →
          </Link>
        ) : null}
      </div>

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
              <button
                className="modal-btn primary"
                type="button"
                onClick={handleAdd}
                disabled={Boolean(entry)}
              >
                {entry ? "In Library ✓" : "+ Add to Library"}
              </button>
              <Link className="modal-btn ghost" href={`/manga/${media.id}`}>
                Open Manga Tracker →
              </Link>
              {linkedAnime ? (
                <Link className="modal-btn ghost" href={`/anime/${linkedAnime.malId}`}>
                  Track Anime
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
            <p className="detail-synopsis">{media.synopsis || "No synopsis available."}</p>
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
                    <span className="info-label">Chapters</span>
                    <span className="info-value">{media.chapters ? String(media.chapters) : "Ongoing"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Volumes</span>
                    <span className="info-value">{media.volumes ? String(media.volumes) : "Ongoing"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Year</span>
                    <span className="info-value">{media.year || "--"}</span>
                  </div>
                  {media.authors && media.authors.length > 0 ? (
                    <div className="info-item" style={{ gridColumn: "1 / -1" }}>
                      <span className="info-label">Author(s)</span>
                      <span className="info-value">{media.authors.join(", ")}</span>
                    </div>
                  ) : null}
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
              <div className="detail-section-title">Characters</div>
              {loading ? (
                <div className="detail-empty">Loading cast…</div>
              ) : characters.length === 0 ? (
                <div className="detail-empty">No cast data available.</div>
              ) : (
                <div className="cast-list">
                  {characters.slice(0, 12).map((char) => (
                    <div className="cast-card" key={char.id || char.name}>
                      <div className="cast-character">
                        {char.image ? (
                          <img className="cast-avatar" src={char.image} alt={char.name} />
                        ) : (
                          <div className="cast-avatar fallback">{char.name.slice(0, 1)}</div>
                        )}
                        <div>
                          <div className="cast-name">{char.name}</div>
                          <div className="cast-role">{char.role || "Character"}</div>
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

