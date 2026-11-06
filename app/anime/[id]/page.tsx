"use client";

function getNow(): number {
  return Date.now();
}


import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  FranchiseGraph,
  JikanCharacter,
  JikanEpisode,
  OkamiMedia,
} from "@/app/lib/jikan";
import {
  fetchCharacters,
  fetchDetail,
  fetchEpisodes,
  fetchFranchiseGraph,
} from "@/app/lib/api";
import {
  addEntry,
  loadEntries,
  loadFranchiseEntries,
  saveEntries,
  saveFranchiseEntries,
  updateEntry,
  type OkamiEntry,
  type OkamiStatus,
  type SeasonProgress,
  type UnifiedFranchiseEntry,
  type WatchStatus,
} from "@/app/lib/storage";

const DEFAULT_STATUS: OkamiStatus = "plan_to_watch";
const STATUS_OPTIONS: Array<{ value: OkamiStatus; label: string }> = [
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_watch", label: "Plan to Watch" },
];

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

  // Currently viewed anime & episodes (can switch between seasons)
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(animeId);
  const [media, setMedia] = useState<OkamiMedia | null>(null);
  const [episodes, setEpisodes] = useState<JikanEpisode[]>([]);
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>(() =>
    loadFranchiseEntries()
  );
  const [activeInfoTab, setActiveInfoTab] = useState<"overview" | "characters" | "seasons">("overview");

  // Keep selectedSeasonId synchronized to animeId
  useEffect(() => {
    if (Number.isFinite(animeId)) {
      Promise.resolve().then(() => setSelectedSeasonId(animeId));
    }
  }, [animeId]);

  const entry = useMemo(
    () => entries.find((item) => item.id === selectedSeasonId && item.type === "anime"),
    [entries, selectedSeasonId]
  );

  const franchise = useMemo(() => {
    if (!franchiseGraph) return null;
    return franchises[franchiseGraph.franchiseId] ?? null;
  }, [franchises, franchiseGraph]);

  const completedEpisodes = entry?.completed_episodes ?? [];
  const seasonStatus = entry?.status ?? DEFAULT_STATUS;

  const commitEntries = (next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const commitFranchises = (next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  };

  // Synchronize season progress to UnifiedFranchiseEntry
  const syncFranchiseState = (seasonId: number, epsWatched: number, totalEps: number, stat: OkamiStatus) => {
    if (!franchiseGraph) return;

    const franchiseId = franchiseGraph.franchiseId;
    const currentFranchise = franchises[franchiseId] ?? {
      franchiseId,
      rootMalId: franchiseGraph.rootMalId,
      title: franchiseGraph.title,
      coverImage: franchiseGraph.cover,
      updatedAt: getNow(),
      activeSeasonMalId: seasonId,
      anime: {
        overallStatus: "PLAN_TO_WATCH",
        seasons: {},
      },
    };

    const watchStat: WatchStatus =
      stat === "watching"
        ? "WATCHING"
        : stat === "completed"
          ? "COMPLETED"
          : stat === "on_hold"
            ? "ON_HOLD"
            : stat === "dropped"
              ? "DROPPED"
              : "PLAN_TO_WATCH";

    const targetSeasonNode = franchiseGraph.seasons.find((s) => s.malId === seasonId);
    const seasonNumber = targetSeasonNode ? targetSeasonNode.seasonNumber : 1;

    const seasonsMap: Record<number, SeasonProgress> = {
      ...(currentFranchise.anime?.seasons ?? {}),
      [seasonId]: {
        malId: seasonId,
        title: media?.title ?? targetSeasonNode?.title ?? `Season ${seasonNumber}`,
        type: (targetSeasonNode?.type as "TV" | "Movie" | "OVA" | "Special" | "ONA") ?? "TV",
        seasonNumber,
        episodesWatched: epsWatched,
        totalEpisodes: totalEps,
        status: watchStat,
      },
    };

    // Determine overall franchise status
    const allCompleted = Object.values(seasonsMap).every((s) => s.status === "COMPLETED");
    const anyWatching = Object.values(seasonsMap).some((s) => s.status === "WATCHING");
    const overallStatus: WatchStatus = allCompleted
      ? "COMPLETED"
      : anyWatching || epsWatched > 0
        ? "WATCHING"
        : "PLAN_TO_WATCH";

    const nextFranchise: UnifiedFranchiseEntry = {
      ...currentFranchise,
      activeSeasonMalId: seasonId,
      updatedAt: getNow(),
      anime: {
        overallStatus,
        seasons: seasonsMap,
      },
    };

    commitFranchises({
      ...franchises,
      [franchiseId]: nextFranchise,
    });
  };

  const applyEntryPatch = (patch: Partial<OkamiEntry>) => {
    if (!media) return;
    let nextEntries: OkamiEntry[];
    let updatedProgress = entry?.progress ?? 0;
    let updatedStatus = entry?.status ?? DEFAULT_STATUS;

    if (patch.progress !== undefined) updatedProgress = patch.progress;
    if (patch.status !== undefined) updatedStatus = patch.status;

    if (entry) {
      nextEntries = updateEntry(entries, entry.id, entry.type, patch);
      commitEntries(nextEntries);
    } else {
      const nextEntry = { ...buildEntry(media), ...patch };
      nextEntries = addEntry(entries, nextEntry);
      commitEntries(nextEntries);
    }

    syncFranchiseState(selectedSeasonId, updatedProgress, media.total ?? 0, updatedStatus);
  };

  const handleAdd = () => {
    if (!media || entry) return;
    const nextEntry = buildEntry(media);
    commitEntries(addEntry(entries, nextEntry));
    syncFranchiseState(selectedSeasonId, 0, media.total ?? 0, DEFAULT_STATUS);
  };

  const toggleEpisode = (value: number) => {
    const next = toggleSelection(completedEpisodes, value);
    const total = media?.total ?? (episodes.length > 0 ? episodes.length : 0);
    const isCompleted = total > 0 && next.length >= total;
    const newStatus: OkamiStatus = isCompleted ? "completed" : next.length > 0 ? "watching" : seasonStatus;

    applyEntryPatch({
      completed_episodes: next,
      progress: next.length,
      status: newStatus,
    });
  };

  const handleStatusChange = (value: OkamiStatus) => {
    applyEntryPatch({ status: value });
  };

  // Mark all episodes of current season as completed with one click
  const handleMarkSeasonComplete = () => {
    if (!media || episodes.length === 0) return;
    const allEps = episodes.map((_, i) => i + 1);
    applyEntryPatch({
      completed_episodes: allEps,
      progress: allEps.length,
      status: "completed",
    });
  };

  // Switch season inside tracker
  const handleSelectSeason = async (seasonMalId: number) => {
    if (seasonMalId === selectedSeasonId) return;
    setSelectedSeasonId(seasonMalId);
    setLoadingEpisodes(true);

    try {
      const [newDetail, newEps] = await Promise.all([
        fetchDetail("anime", seasonMalId),
        fetchEpisodes(seasonMalId),
      ]);
      setMedia(newDetail);
      setEpisodes(newEps);
    } catch {
      // Keep existing on failure
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!Number.isFinite(animeId)) return;

    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setMedia(null);
      setEpisodes([]);
      setCharacters([]);
      setFranchiseGraph(null);
    });

    const load = async () => {
      try {
        const [detail, episodeList, cast, graph] = await Promise.all([
          fetchDetail("anime", animeId),
          fetchEpisodes(animeId),
          fetchCharacters(animeId).catch(() => []),
          fetchFranchiseGraph(animeId, "anime").catch(() => null),
        ]);
        if (!active) return;
        setMedia(detail);
        setEpisodes(episodeList);
        setCharacters(cast);
        setFranchiseGraph(graph);
      } catch {
        if (!active) return;
        setMedia(null);
        setEpisodes([]);
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

  // Compute Total Franchise Progress across all seasons
  const franchiseStats = useMemo(() => {
    if (!franchiseGraph) return null;

    let totalEps = 0;
    let watchedEps = 0;
    const seasonEntries = franchiseGraph.seasons;

    seasonEntries.forEach((s) => {
      const storedEntry = entries.find((e) => e.id === s.malId && e.type === "anime");
      const franchiseSeason = franchise?.anime?.seasons?.[s.malId];
      const count = franchiseSeason?.episodesWatched ?? storedEntry?.progress ?? 0;
      watchedEps += count;
      totalEps += s.episodes ?? 0;
    });

    return { totalEps, watchedEps, seasonCount: seasonEntries.length };
  }, [franchiseGraph, franchise, entries]);

  const linkedManga = franchiseGraph?.adaptations?.[0] ?? null;
  const allSeasons = franchiseGraph?.seasons ?? [];
  const allExtras = franchiseGraph?.extras ?? [];

  if (!Number.isFinite(animeId)) {
    return (
      <div className="detail-page">
        <div className="detail-page-header">
          <Link className="back-link" href="/">
            ← Back to Library
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="back-link" href="/">
            ← Back to Library
          </Link>
          {media ? <span className="detail-page-id">MAL #{media.id}</span> : null}
        </div>
        {linkedManga ? (
          <Link
            className="adaptation-pill manga-link"
            href={`/manga/${linkedManga.malId}`}
            title="Open linked Manga adaptation"
          >
            📖 Switch to Manga: {linkedManga.title} →
          </Link>
        ) : null}
      </div>

      {/* Franchise Banner */}
      {franchiseGraph && (allSeasons.length > 1 || linkedManga || allExtras.length > 0) ? (
        <div className="franchise-strip-banner">
          <div className="franchise-strip-badge">UNIFIED FRANCHISE</div>
          <div className="franchise-strip-title">{franchiseGraph.title}</div>
          <div className="franchise-strip-meta">
            {franchiseStats ? (
              <span className="accent-text">
                {franchiseStats.watchedEps} / {franchiseStats.totalEps || "?"} Episodes Watched
                ({franchiseStats.seasonCount} Seasons)
              </span>
            ) : null}
            {allExtras.length > 0 ? <span>• {allExtras.length} Movies/OVAs</span> : null}
            {linkedManga ? <span>• Manga Adaptation Available</span> : null}
          </div>
        </div>
      ) : null}

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
                  {media.studios && media.studios.length > 0 ? (
                    <>
                      <span>•</span>
                      <span>{media.studios.join(", ")}</span>
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
              {linkedManga ? (
                <Link className="modal-btn ghost" href={`/manga/${linkedManga.malId}`}>
                  Read Manga Adaptation
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
        {/* Left Column: Multi-Season Selector & Episode Tracking */}
        <div className="detail-card detail-episodes-card">
          <div className="detail-section">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div className="detail-section-title" style={{ margin: 0 }}>
                Episode Tracking ({completedEpisodes.length} / {media?.total ?? (episodes.length > 0 ? episodes.length : "?")})
              </div>
              {entry && episodes.length > 0 ? (
                <button
                  className="btn-text-link"
                  type="button"
                  onClick={handleMarkSeasonComplete}
                  title="Mark all episodes in this season as watched"
                >
                  ✓ Complete Season
                </button>
              ) : null}
            </div>

            {/* Season Selector Accordion / Tabs */}
            {allSeasons.length > 1 ? (
              <div className="season-selector-bar">
                <span className="season-selector-label">SEASONS:</span>
                <div className="season-pills-row">
                  {allSeasons.map((season) => {
                    const isSelected = season.malId === selectedSeasonId;
                    const stored = entries.find((e) => e.id === season.malId);
                    const isDone = stored?.status === "completed";
                    return (
                      <button
                        key={season.malId}
                        type="button"
                        className={`season-pill ${isSelected ? "active" : ""} ${isDone ? "completed" : ""}`}
                        onClick={() => handleSelectSeason(season.malId)}
                      >
                        <span>S{season.seasonNumber}</span>
                        {isDone ? <span className="season-done-mark">✓</span> : null}
                      </button>
                    );
                  })}
                  {allExtras.length > 0 ? (
                    <div className="season-extras-dropdown">
                      {allExtras.map((extra) => (
                        <button
                          key={extra.malId}
                          type="button"
                          className={`season-pill extra ${extra.malId === selectedSeasonId ? "active" : ""}`}
                          onClick={() => handleSelectSeason(extra.malId)}
                        >
                          {extra.type}: {extra.title.slice(0, 15)}...
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {loadingEpisodes ? (
              <div className="detail-empty">Switching seasons…</div>
            ) : episodes.length === 0 ? (
              <div className="detail-empty">Episode list unavailable.</div>
            ) : (
              <div className="episode-list custom-scroll">
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
                        {episode.title ||
                          episode.title_english ||
                          episode.title_japanese ||
                          `Episode ${value}`}
                      </span>
                      <span className="episode-meta">{episode.duration || ""}</span>
                      <span className="episode-toggle">{active ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {!entry ? <div className="detail-empty">Add this anime to track episodes.</div> : null}
          </div>
        </div>

        {/* Right Column: Overview, Cast & Franchise Media */}
        <div className="detail-card detail-info-card">
          <div className="detail-tabs">
            <button
              className={`detail-tab ${activeInfoTab === "overview" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveInfoTab("overview")}
            >
              Overview
            </button>
            <button
              className={`detail-tab ${activeInfoTab === "characters" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveInfoTab("characters")}
            >
              Characters
            </button>
            {franchiseGraph && (allSeasons.length > 1 || linkedManga) ? (
              <button
                className={`detail-tab ${activeInfoTab === "seasons" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveInfoTab("seasons")}
              >
                Franchise Hub
              </button>
            ) : null}
          </div>

          <div className="detail-info-body custom-scroll">
            {activeInfoTab === "overview" ? (
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
                      <span className="info-value">
                        {media.total ? String(media.total) : "Ongoing"}
                      </span>
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
                <div className="detail-section">
                  <div className="detail-section-title">Season Status</div>
                  <div className="status-button-row" role="group" aria-label="Season status">
                    {STATUS_OPTIONS.map((option) => {
                      const active = seasonStatus === option.value;
                      const statusClass = option.value.replace(/_/g, "-");
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`status-button status-${statusClass} ${active ? "active" : ""}`}
                          aria-pressed={active}
                          onClick={() => handleStatusChange(option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {!entry ? (
                    <div className="detail-empty">Status changes will add this anime to your library.</div>
                  ) : null}
                </div>
              </div>
            ) : activeInfoTab === "characters" ? (
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
            ) : (
              <div className="detail-section">
                <div className="detail-section-title">All Franchise Entries</div>

                {/* Mainline Seasons List */}
                <div style={{ marginBottom: 20 }}>
                  <div className="franchise-group-title">Mainline Chronological Seasons</div>
                  <div className="franchise-nodes-list">
                    {allSeasons.map((season) => {
                      const isCurrent = season.malId === selectedSeasonId;
                      const stored = entries.find((e) => e.id === season.malId);
                      return (
                        <div
                          className={`franchise-node-item ${isCurrent ? "current" : ""}`}
                          key={season.malId}
                        >
                          <img className="franchise-node-thumb" src={season.cover} alt={season.title} />
                          <div style={{ flex: 1 }}>
                            <div className="franchise-node-title">
                              S{season.seasonNumber}: {season.title}
                            </div>
                            <div className="franchise-node-sub">
                              {season.year || "--"} • {season.episodes ? `${season.episodes} eps` : "Ongoing"}
                              {stored ? ` • Watched ${stored.progress}/${stored.total ?? "?"}` : ""}
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="franchise-node-active-pill">CURRENT</span>
                          ) : (
                            <button
                              className="franchise-node-action"
                              type="button"
                              onClick={() => handleSelectSeason(season.malId)}
                            >
                              Track →
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Linked Manga Adaptation */}
                {linkedManga ? (
                  <div style={{ marginBottom: 20 }}>
                    <div className="franchise-group-title">Source / Linked Manga</div>
                    <div className="franchise-node-item">
                      <img className="franchise-node-thumb" src={linkedManga.cover} alt={linkedManga.title} />
                      <div style={{ flex: 1 }}>
                        <div className="franchise-node-title">{linkedManga.title}</div>
                        <div className="franchise-node-sub">
                          {linkedManga.type} • {linkedManga.year || "--"}
                        </div>
                      </div>
                      <Link className="franchise-node-action manga" href={`/manga/${linkedManga.malId}`}>
                        Open Manga Tracker →
                      </Link>
                    </div>
                  </div>
                ) : null}

                {/* Movies & Extras */}
                {allExtras.length > 0 ? (
                  <div>
                    <div className="franchise-group-title">Movies, OVAs & Specials</div>
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
                          <button
                            className="franchise-node-action"
                            type="button"
                            onClick={() => handleSelectSeason(extra.malId)}
                          >
                            Track →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
