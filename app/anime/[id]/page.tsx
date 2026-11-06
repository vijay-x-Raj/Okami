"use client";

function getNow(): number {
  return Date.now();
}

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type FranchiseGraph,
  type JikanCharacter,
  type JikanEpisode,
  type OkamiMedia,
  parseMediaNumber,
  formatMediaNumberDisplay,
} from "@/app/lib/jikan";
import {
  fetchCharacters,
  fetchDetail,
  fetchEpisodes,
  fetchFranchiseGraph,
} from "@/app/lib/api";
import {
  addEntry,
  bulkWatchEpisodes,
  getFranchiseByMalId,
  loadEntries,
  loadFranchiseEntries,
  markSeasonCompleted,
  saveEntries,
  saveFranchiseEntries,
  toggleEpisode as storageToggleEpisode,
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
  const [episodePage, setEpisodePage] = useState<number>(1);
  const [pagination, setPagination] = useState<{ last_visible_page: number; has_next_page: boolean }>({
    last_visible_page: 1,
    has_next_page: false,
  });
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>(() =>
    loadFranchiseEntries()
  );
  const [activeInfoTab, setActiveInfoTab] = useState<"overview" | "characters" | "seasons">("overview");
  const [numberingMode, setNumberingMode] = useState<"relative" | "absolute">("relative");

  // Keep selectedSeasonId synchronized to animeId on initial navigation
  useEffect(() => {
    if (Number.isFinite(animeId)) {
      Promise.resolve().then(() => {
        setSelectedSeasonId(animeId);
        setEpisodePage(1);
      });
    }
  }, [animeId]);

  const entry = useMemo(
    () => entries.find((item) => item.id === selectedSeasonId && item.type === "anime"),
    [entries, selectedSeasonId]
  );

  const franchise = useMemo(() => {
    if (franchiseGraph) {
      return franchises[franchiseGraph.franchiseId] ?? null;
    }
    return getFranchiseByMalId(franchises, selectedSeasonId) ?? null;
  }, [franchises, franchiseGraph, selectedSeasonId]);

  const currentSeasonProgress: SeasonProgress | undefined =
    franchise?.anime?.seasons?.[selectedSeasonId];

  const completedEpisodes = useMemo(() => {
    return currentSeasonProgress?.watchedEpisodeIds ?? entry?.completed_episodes ?? [];
  }, [currentSeasonProgress, entry]);

  const seasonStatus: OkamiStatus = entry?.status ?? (currentSeasonProgress?.status === "WATCHING" ? "watching" : currentSeasonProgress?.status === "COMPLETED" ? "completed" : currentSeasonProgress?.status === "ON_HOLD" ? "on_hold" : currentSeasonProgress?.status === "DROPPED" ? "dropped" : "plan_to_watch");

  const commitEntries = (next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const commitFranchises = (next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  };

  // Synchronize season progress to UnifiedFranchiseEntry
  const syncFranchiseState = (
    seasonId: number,
    epsWatched: number,
    totalEps: number,
    stat: OkamiStatus,
    watchedIds: number[]
  ) => {
    if (!franchiseGraph) return;

    const franchiseId = franchiseGraph.franchiseId;
    const now = getNow();
    const currentFranchise = franchises[franchiseId] ?? {
      franchiseId,
      rootMalId: franchiseGraph.rootMalId,
      title: franchiseGraph.title,
      coverImage: franchiseGraph.cover,
      bannerImage: franchiseGraph.bannerImage ?? undefined,
      genres: media?.genres || [],
      addedAt: now,
      updatedAt: now,
      isFavorite: false,
      linkedMalIds: [franchiseGraph.rootMalId, ...franchiseGraph.seasons.map((s) => s.malId)],
      anime: {
        overallStatus: "PLAN_TO_WATCH" as WatchStatus,
        activeSeasonMalId: seasonId,
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

    const updatedSeason: SeasonProgress = {
      malId: seasonId,
      title: media?.title ?? targetSeasonNode?.title ?? `Season ${seasonNumber}`,
      titleEnglish: media?.title_english ?? targetSeasonNode?.titleEnglish ?? null,
      coverImage: media?.cover ?? targetSeasonNode?.cover ?? "",
      type: (targetSeasonNode?.type as "TV" | "Movie" | "OVA" | "Special" | "ONA") ?? "TV",
      seasonNumber,
      episodesWatched: epsWatched,
      totalEpisodes: totalEps,
      watchedEpisodeIds: watchedIds,
      status: watchStat,
      score: entry?.user_score ?? 0,
      notes: entry?.notes || "",
      updatedAt: now,
    };

    const seasonsMap: Record<number, SeasonProgress> = {
      ...(currentFranchise.anime?.seasons ?? {}),
      [seasonId]: updatedSeason,
    };

    const allCompleted = Object.values(seasonsMap).every((s) => s.status === "COMPLETED");
    const anyWatching = Object.values(seasonsMap).some((s) => s.status === "WATCHING");
    const overallStatus: WatchStatus = allCompleted
      ? "COMPLETED"
      : anyWatching || epsWatched > 0
        ? "WATCHING"
        : "PLAN_TO_WATCH";

    const nextFranchise: UnifiedFranchiseEntry = {
      ...currentFranchise,
      updatedAt: now,
      anime: {
        overallStatus,
        activeSeasonMalId: seasonId,
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
    let updatedWatched = entry?.completed_episodes ?? [];

    if (patch.progress !== undefined) updatedProgress = patch.progress;
    if (patch.status !== undefined) updatedStatus = patch.status;
    if (patch.completed_episodes !== undefined) updatedWatched = patch.completed_episodes;

    if (entry) {
      nextEntries = updateEntry(entries, entry.id, entry.type, patch);
      commitEntries(nextEntries);
    } else {
      const nextEntry = { ...buildEntry(media), ...patch };
      nextEntries = addEntry(entries, nextEntry);
      commitEntries(nextEntries);
    }

    syncFranchiseState(
      selectedSeasonId,
      updatedProgress,
      media.total ?? 0,
      updatedStatus,
      updatedWatched
    );
  };

  const handleAdd = () => {
    if (!media || entry) return;
    const nextEntry = buildEntry(media);
    commitEntries(addEntry(entries, nextEntry));
    syncFranchiseState(selectedSeasonId, 0, media.total ?? 0, DEFAULT_STATUS, []);
  };

  const toggleEpisode = (epNumber: number) => {
    if (franchiseGraph) {
      const nextFranchises = storageToggleEpisode(
        franchises,
        franchiseGraph.franchiseId,
        selectedSeasonId,
        epNumber
      );
      commitFranchises(nextFranchises);
    }

    const nextWatched = completedEpisodes.includes(epNumber)
      ? completedEpisodes.filter((n) => n !== epNumber)
      : [...completedEpisodes, epNumber].sort((a, b) => a - b);

    const total = media?.total ?? (episodes.length > 0 ? episodes.length : 0);
    const isCompleted = total > 0 && nextWatched.length >= total;
    const newStatus: OkamiStatus = isCompleted
      ? "completed"
      : nextWatched.length > 0
        ? "watching"
        : seasonStatus;

    applyEntryPatch({
      completed_episodes: nextWatched,
      progress: nextWatched.length,
      status: newStatus,
    });
  };

  const handleWatchUpTo = (epNumber: number) => {
    if (franchiseGraph) {
      const nextFranchises = bulkWatchEpisodes(
        franchises,
        franchiseGraph.franchiseId,
        selectedSeasonId,
        epNumber
      );
      commitFranchises(nextFranchises);
    }

    const watchedSet = new Set<number>();
    for (let i = 1; i <= epNumber; i++) {
      watchedSet.add(i);
    }
    const nextWatched = Array.from(watchedSet).sort((a, b) => a - b);
    const total = media?.total ?? 0;
    const isCompleted = total > 0 && nextWatched.length >= total;

    applyEntryPatch({
      completed_episodes: nextWatched,
      progress: nextWatched.length,
      status: isCompleted ? "completed" : "watching",
    });
  };

  const handleMarkSeasonComplete = () => {
    const total = media?.total ?? (episodes.length > 0 ? episodes.length : 12);
    if (franchiseGraph) {
      const nextFranchises = markSeasonCompleted(
        franchises,
        franchiseGraph.franchiseId,
        selectedSeasonId,
        total
      );
      commitFranchises(nextFranchises);
    }

    const allEps = Array.from({ length: total }, (_, i) => i + 1);
    applyEntryPatch({
      completed_episodes: allEps,
      progress: allEps.length,
      status: "completed",
    });
  };

  const handleStatusChange = (value: OkamiStatus) => {
    applyEntryPatch({ status: value });
  };

  // Switch season inside tracker
  const handleSelectSeason = async (seasonMalId: number) => {
    if (seasonMalId === selectedSeasonId) return;
    setSelectedSeasonId(seasonMalId);
    setEpisodePage(1);
    setLoadingEpisodes(true);

    try {
      const newDetail = await fetchDetail("anime", seasonMalId);
      const epData = await fetchEpisodes(seasonMalId, 1, {
        total: newDetail?.total ?? 0,
        status: newDetail?.status,
      });
      setMedia(newDetail);
      setEpisodes(epData.episodes);
      setPagination(epData.pagination);
    } catch {
      // Keep existing on failure
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // Fetch paginated episodes (e.g. Page 2 for shows with >100 episodes)
  const handlePageChange = async (newPage: number) => {
    if (newPage === episodePage || newPage < 1) return;
    setLoadingEpisodes(true);
    setEpisodePage(newPage);
    try {
      const epData = await fetchEpisodes(selectedSeasonId, newPage, {
        total: media?.total ?? 0,
        status: media?.status,
      });
      setEpisodes(epData.episodes);
      setPagination(epData.pagination);
    } catch {
      // Keep existing
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
        const detail = await fetchDetail("anime", animeId);
        const [epData, cast, graph] = await Promise.all([
          fetchEpisodes(animeId, 1, {
            total: detail?.total ?? 0,
            status: detail?.status,
          }),
          fetchCharacters(animeId, "anime").catch(() => []),
          fetchFranchiseGraph(animeId, "anime").catch(() => null),
        ]);
        if (!active) return;
        setMedia(detail);
        setEpisodes(epData.episodes);
        setPagination(epData.pagination);
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

    const percent = totalEps > 0 ? Math.min(100, Math.round((watchedEps / totalEps) * 100)) : 0;

    return { totalEps, watchedEps, seasonCount: seasonEntries.length, percent };
  }, [franchiseGraph, franchise, entries]);

  // Active Season Progress
  const activeSeasonStats = useMemo(() => {
    const total = media?.total ?? (episodes.length > 0 ? episodes.length : 0);
    const watched = completedEpisodes.length;
    const percent = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0;
    return { watched, total, percent };
  }, [media, episodes, completedEpisodes]);

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
          {media ? (
            <Link className="adaptation-pill anime-link" href={`/anime/${media.id}/info`}>
              ℹ View Full Anime Info →
            </Link>
          ) : null}
        </div>
        {linkedManga ? (
          <Link
            className="adaptation-pill manga-link"
            href={`/manga/${linkedManga.malId}`}
            title="Open linked Manga adaptation"
          >
            Switch to Manga: {linkedManga.title} →
          </Link>
        ) : null}
      </div>

      {/* Franchise Banner & Dual Progress */}
      {franchiseGraph && (
        <div className="franchise-strip-banner">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="franchise-strip-badge">UNIFIED FRANCHISE COMMAND CENTER</div>
            {franchiseStats && franchiseStats.seasonCount > 1 ? (
              <span className="franchise-strip-meta accent-text">
                {franchiseStats.watchedEps} / {franchiseStats.totalEps || "?"} Episodes ({franchiseStats.percent}%)
              </span>
            ) : null}
          </div>
          <div className="franchise-strip-title">{franchiseGraph.title}</div>

          {/* Dual Progress Bars */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {franchiseStats && franchiseStats.seasonCount > 1 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                  <span>FRANCHISE TOTAL PROGRESS ({franchiseStats.seasonCount} Seasons)</span>
                  <span>{franchiseStats.watchedEps} / {franchiseStats.totalEps || "?"} Eps ({franchiseStats.percent}%)</span>
                </div>
                <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${franchiseStats.percent}%`,
                      background: "var(--gold)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                <span>ACTIVE SEASON PROGRESS: {media?.title || "Season"}</span>
                <span>{activeSeasonStats.watched} / {activeSeasonStats.total || "?"} Eps ({activeSeasonStats.percent}%)</span>
              </div>
              <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${activeSeasonStats.percent}%`,
                    background: "var(--accent)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
              <Link className="modal-btn ghost" href={`/anime/${media.id}/info`}>
                Full Overview & Cast
              </Link>
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
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div className="detail-section-title" style={{ margin: 0 }}>
                Episode Tracker ({completedEpisodes.length} / {media?.total ?? (episodes.length > 0 ? episodes.length : "?")})
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="btn-text-link"
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--text-2)",
                    cursor: "pointer",
                  }}
                  onClick={() => setNumberingMode((prev) => (prev === "relative" ? "absolute" : "relative"))}
                  title="Toggle between Season-Relative (S2 Ep 1) and Absolute (Ep 26) numbering"
                >
                  {numberingMode === "relative" ? "Mode: S-Relative" : "Mode: Absolute"}
                </button>
                {entry && episodes.length > 0 ? (
                  <button
                    className="btn-text-link"
                    type="button"
                    onClick={handleMarkSeasonComplete}
                    title="Mark all episodes in this season as watched"
                  >
                    ✓ Mark Season Completed
                  </button>
                ) : null}
              </div>
            </div>

            {/* Season Selector Accordion / Tabs */}
            {allSeasons.length > 1 ? (
              <div className="season-selector-bar">
                <span className="season-selector-label">CANON SEASONS:</span>
                <div className="season-pills-row">
                  {allSeasons.map((season) => {
                    const isSelected = season.malId === selectedSeasonId;
                    const franchiseSeason = franchise?.anime?.seasons?.[season.malId];
                    const isDone =
                      franchiseSeason?.status === "COMPLETED" ||
                      entries.find((e) => e.id === season.malId)?.status === "completed";
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
                          {extra.type}: {extra.title.slice(0, 16)}…
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Episodes List */}
            {loadingEpisodes ? (
              <div className="detail-empty">Loading episodes…</div>
            ) : episodes.length === 0 ? (
              <div className="detail-empty">Episode list unavailable.</div>
            ) : (
              <>
                <div className="episode-list custom-scroll">
                  {episodes.map((episode) => {
                    const value = episode.mal_id;
                    const active = completedEpisodes.includes(value);
                    const currentSeason = allSeasons.find((s) => s.malId === selectedSeasonId);
                    const parsedEp = parseMediaNumber(episode.title || episode.mal_id, "anime");
                    const epLabel = formatMediaNumberDisplay({
                      mediaType: "anime",
                      seasonNumber: currentSeason?.seasonNumber,
                      number: parsedEp.number,
                      mode: numberingMode,
                    });
                    return (
                      <div
                        key={episode.mal_id}
                        className={`episode-row ${active ? "active" : ""}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      >
                        <button
                          type="button"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            flex: 1,
                            textAlign: "left",
                            cursor: entry ? "pointer" : "default",
                          }}
                          onClick={() => entry && toggleEpisode(value)}
                          disabled={!entry}
                        >
                          <span className="episode-id">{epLabel}</span>
                          <span className="episode-title">
                            {episode.title ||
                              episode.title_english ||
                              episode.title_japanese ||
                              `Episode ${value}`}
                          </span>
                          {episode.filler && (
                            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(232, 25, 75, 0.2)", color: "var(--accent)", border: "1px solid var(--accent)", fontWeight: 700 }}>
                              FILLER
                            </span>
                          )}
                          {episode.recap && (
                            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(61, 184, 156, 0.2)", color: "var(--teal)", border: "1px solid var(--teal)", fontWeight: 700 }}>
                              RECAP
                            </span>
                          )}
                          <span className="episode-meta">{episode.aired ? new Date(episode.aired).toLocaleDateString() : ""}</span>
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {entry && !active && (
                            <button
                              type="button"
                              className="btn-text-link"
                              style={{ fontSize: 10, opacity: 0.8 }}
                              onClick={() => handleWatchUpTo(value)}
                              title={`Watch up to Ep ${value}`}
                            >
                              Watch up to here
                            </button>
                          )}
                          <button
                            type="button"
                            className="episode-toggle"
                            onClick={() => entry && toggleEpisode(value)}
                            disabled={!entry}
                            title={active ? "Mark uncompleted" : "Mark completed"}
                          >
                            {active ? "✓" : "○"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Controls for >100 episodes */}
                {pagination.last_visible_page > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="pill"
                      disabled={episodePage <= 1}
                      onClick={() => handlePageChange(episodePage - 1)}
                    >
                      ← Prev
                    </button>
                    {Array.from({ length: pagination.last_visible_page }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`pill ${p === episodePage ? "active" : ""}`}
                        onClick={() => handlePageChange(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="pill"
                      disabled={!pagination.has_next_page}
                      onClick={() => handlePageChange(episodePage + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
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
                      const franchiseSeason = franchise?.anime?.seasons?.[season.malId];
                      const stored = entries.find((e) => e.id === season.malId);
                      const epsDone = franchiseSeason?.episodesWatched ?? stored?.progress ?? 0;
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
                              {epsDone > 0 ? ` • Watched ${epsDone}/${season.episodes ?? "?"}` : ""}
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
