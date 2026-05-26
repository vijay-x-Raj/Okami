"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { JikanEpisode, OkamiMedia } from "@/app/lib/jikan";
import { fetchDetail, fetchEpisodes, fetchRelated } from "@/app/lib/api";
import {
  addEntry,
  loadEntries,
  saveEntries,
  updateEntry,
  type OkamiEntry,
  type OkamiStatus,
} from "@/app/lib/storage";

const DEFAULT_STATUS: OkamiStatus = "plan_to_watch";

function toggleSelection(current: number[], value: number) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value].sort((a, b) => a - b);
}

function buildEntry(media: OkamiMedia, existing?: OkamiEntry): OkamiEntry {
  return {
    id: media.id,
    type: "anime",
    title: media.title,
    cover: media.cover,
    year: media.year,
    format: media.format,
    genres: media.genres,
    official_score: media.official_score,
    user_score: existing?.user_score ?? null,
    status: existing?.status ?? DEFAULT_STATUS,
    progress: existing?.progress ?? 0,
    total: media.total ?? null,
    completed_seasons: existing?.completed_seasons ?? [],
    completed_volumes: existing?.completed_volumes ?? [],
    completed_episodes: existing?.completed_episodes ?? [],
    date_added: existing?.date_added ?? new Date().toISOString(),
    notes: existing?.notes ?? media.synopsis ?? "",
    is_favourite: existing?.is_favourite ?? false,
  };
}

export default function AnimeDetailPage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const animeId = rawId ? Number(rawId) : Number.NaN;
  const [media, setMedia] = useState<OkamiMedia | null>(null);
  const [episodes, setEpisodes] = useState<JikanEpisode[]>([]);
  const [seasonCount, setSeasonCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());

  const entry = useMemo(
    () => entries.find((item) => item.id === animeId && item.type === "anime"),
    [entries, animeId]
  );

  const completedSeasons = entry?.completed_seasons ?? [];
  const completedEpisodes = entry?.completed_episodes ?? [];

  const commitEntries = (next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const applyEntryPatch = (patch: Partial<OkamiEntry>) => {
    if (!media) return;
    if (entry) {
      commitEntries(updateEntry(entries, entry.id, entry.type, patch));
      return;
    }
    const nextEntry = { ...buildEntry(media), ...patch };
    commitEntries(addEntry(entries, nextEntry));
  };

  const handleAdd = () => {
    if (!media || entry) return;
    commitEntries(addEntry(entries, buildEntry(media)));
  };

  const toggleSeason = (value: number) => {
    const next = toggleSelection(completedSeasons, value);
    applyEntryPatch({ completed_seasons: next });
  };

  const toggleEpisode = (value: number) => {
    const next = toggleSelection(completedEpisodes, value);
    applyEntryPatch({ completed_episodes: next, progress: next.length });
  };

  useEffect(() => {
    if (!Number.isFinite(animeId)) return;

    let active = true;

    const load = async () => {
      try {
        const [detail, episodeList, related] = await Promise.all([
          fetchDetail("anime", animeId),
          fetchEpisodes(animeId),
          fetchRelated("anime", animeId),
        ]);
        if (!active) return;
        setMedia(detail);
        setEpisodes(episodeList);

        const sequelCount = related
          .filter((relation) => (relation.relation ?? "").toLowerCase() === "sequel")
          .reduce(
            (sum, relation) =>
              sum + (relation.entry?.filter((item) => (item.type ?? "").toLowerCase() === "anime").length ?? 0),
            0
          );
        const episodeTotal = detail.episodes ?? detail.total ?? episodeList.length ?? 0;
        const estimate = episodeTotal ? Math.max(1, Math.ceil(episodeTotal / 12)) : 1;
        const count = Math.max(estimate, sequelCount + 1);
        setSeasonCount(count);
      } catch {
        if (!active) return;
        setMedia(null);
        setEpisodes([]);
        setSeasonCount(null);
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

      <div className="detail-page-grid">
        <div className="detail-card">
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
              <div className="detail-section">
                <div className="detail-section-title">Synopsis</div>
                <p className="detail-synopsis">{media.synopsis || "No synopsis yet."}</p>
              </div>
              <div className="detail-page-actions">
                <button className="modal-btn primary" type="button" onClick={handleAdd} disabled={Boolean(entry)}>
                  {entry ? "In Library" : "Add to Library"}
                </button>
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

        <div className="detail-card">
          <div className="detail-section">
            <div className="detail-section-title">Season Tracking</div>
            {seasonCount ? (
              <>
                <div className="tile-grid">
                  {Array.from({ length: seasonCount }, (_, index) => {
                    const value = index + 1;
                    const active = completedSeasons.includes(value);
                    return (
                      <button
                        key={`season-${value}`}
                        type="button"
                        className={`tile ${active ? "active" : ""}`}
                        aria-pressed={active}
                        onClick={() => toggleSeason(value)}
                        disabled={!entry}
                      >
                        S{String(value).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
                <span className="field-help">
                  {completedSeasons.length} / {seasonCount} seasons marked complete.
                </span>
              </>
            ) : (
              <div className="detail-empty">Season count unavailable.</div>
            )}
            {!entry ? <div className="detail-empty">Add this anime to start tracking.</div> : null}
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Episode Tracking</div>
            {episodes.length === 0 ? (
              <div className="detail-empty">Episode list unavailable.</div>
            ) : (
              <div className="episode-list">
                {episodes.map((episode, index) => {
                  const value = index + 1;
                  const active = completedEpisodes.includes(value);
                  return (
                    <button
                      key={episode.mal_id}
                      type="button"
                      className={`episode-row ${active ? "active" : ""}`}
                      onClick={() => toggleEpisode(value)}
                      disabled={!entry}
                    >
                      <span className="episode-id">EP.{String(value).padStart(2, "0")}</span>
                      <span className="episode-title">
                        {episode.title || episode.title_english || episode.title_japanese || `Episode ${value}`}
                      </span>
                      <span className="episode-toggle">{active ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {!entry ? <div className="detail-empty">Add this anime to mark episodes.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
