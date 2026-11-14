"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type {
  JikanEpisode,
  JikanRelation,
  MangaVolumeItem,
  MediaType,
  OkamiEntry,
  OkamiMedia,
} from "../lib/jikan";
import { fetchEpisodes, fetchRelated, fetchVolumes } from "../lib/api";
import { formatScore } from "../lib/libraryUtils";

export function DetailPanel({
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
  const [volumes, setVolumes] = useState<MangaVolumeItem[]>([]);
  const [related, setRelated] = useState<JikanRelation[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const relatedItems = useMemo<
    {
      id: number;
      type: MediaType;
      name: string;
      relation: string;
    }[]
  >(() => {
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
        setEpisodes(data.episodes);
      } finally {
        setTabLoading(false);
      }
    }

    if (tab === "volumes" && media.type === "manga" && volumes.length === 0) {
      setTabLoading(true);
      try {
        const data = await fetchVolumes(media.id);
        setVolumes(data.volumes);
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
      <aside
        className={`detail-panel ${media.type === "manga" ? "theme-manga" : "theme-anime"}`}
        onClick={(event) => event.stopPropagation()}
      >
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
              Open Tracker →
            </Link>
          ) : (
            <Link className="modal-btn ghost" href={`/manga/${media.id}`}>
              Open Tracker →
            </Link>
          )}
          <Link
            className="modal-btn ghost"
            href={media.type === "anime" ? `/anime/${media.id}/info` : `/manga/${media.id}/info`}
          >
            Full Info & Cast →
          </Link>
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
            <p className="detail-synopsis">
              {loading ? "Loading details…" : media.synopsis || "No synopsis yet."}
            </p>
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
                {episodes.map((episode) => (
                  <div className="detail-list-row" key={episode.mal_id}>
                    <span className="detail-list-id">
                      EP.{String(episode.mal_id).padStart(2, "0")}
                    </span>
                    <span className="detail-list-title">
                      {episode.title ||
                        episode.title_english ||
                        episode.title_japanese ||
                        `Episode ${episode.mal_id}`}
                    </span>
                    {episode.duration ? (
                      <span className="detail-list-meta">{episode.duration}</span>
                    ) : null}
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
                {volumes.map((vol) => (
                  <div className="detail-list-row" key={vol.volumeNumber}>
                    <span className="detail-list-id">
                      VOL.{String(vol.volumeNumber).padStart(2, "0")}
                    </span>
                    <span className="detail-list-title">
                      {vol.title} {vol.estimatedChapters ? `(${vol.estimatedChapters})` : ""}
                    </span>
                  </div>
                ))}
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
              <div>
                {/* ── Section 1: Related Anime Series ── */}
                {relatedItems.filter((i) => i.type === "anime").length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="franchise-section-divider" style={{ margin: "8px 0 12px" }}>
                      <span className="franchise-section-badge anime">Anime Releases</span>
                      <span className="franchise-section-count">
                        {relatedItems.filter((i) => i.type === "anime").length} Titles
                      </span>
                    </div>
                    <div className="related-grid">
                      {relatedItems
                        .filter((item) => item.type === "anime")
                        .map((item) => {
                          const key = `${item.type}:${item.id}`;
                          const isInLibrary = entryMap.has(key);
                          return (
                            <div className="related-card" key={key}>
                              <div className="related-title">{item.name}</div>
                              <div className="related-meta">
                                <span
                                  className={`relation-chip ${item.relation.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                  {item.relation}
                                </span>
                              </div>
                              <button
                                className={`card-action-btn ${isInLibrary ? "in-library" : "primary"}`}
                                type="button"
                                onClick={() =>
                                  isInLibrary
                                    ? onSelectRelated(item.type, item.id)
                                    : onAddRelated(item.type, item.id)
                                }
                              >
                                {isInLibrary ? "In Library ✓" : "+ Add"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ── Section 2: Related Manga & Light Novels ── */}
                {relatedItems.filter((i) => i.type === "manga").length > 0 && (
                  <div>
                    <div className="franchise-section-divider" style={{ margin: "8px 0 12px" }}>
                      <span className="franchise-section-badge manga">Manga Publications</span>
                      <span className="franchise-section-count">
                        {relatedItems.filter((i) => i.type === "manga").length} Titles
                      </span>
                    </div>
                    <div className="related-grid">
                      {relatedItems
                        .filter((item) => item.type === "manga")
                        .map((item) => {
                          const key = `${item.type}:${item.id}`;
                          const isInLibrary = entryMap.has(key);
                          return (
                            <div className="related-card" key={key}>
                              <div className="related-title">{item.name}</div>
                              <div className="related-meta">
                                <span
                                  className={`relation-chip ${item.relation.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                  {item.relation}
                                </span>
                              </div>
                              <button
                                className={`card-action-btn ${isInLibrary ? "in-library" : "primary"}`}
                                type="button"
                                onClick={() =>
                                  isInLibrary
                                    ? onSelectRelated(item.type, item.id)
                                    : onAddRelated(item.type, item.id)
                                }
                              >
                                {isInLibrary ? "In Library ✓" : "+ Add"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
