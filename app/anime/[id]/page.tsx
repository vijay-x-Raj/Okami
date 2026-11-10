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
  type JikanRelation,
  type OkamiMedia,
} from "@/app/lib/jikan";
import {
  fetchCharacters,
  fetchDetail,
  fetchFranchiseGraph,
  fetchRelated,
} from "@/app/lib/api";
import {
  addEntry,
  getFranchiseByMalId,
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

  // Currently viewed anime / season
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(animeId);
  const [media, setMedia] = useState<OkamiMedia | null>(() => {
    const all = loadEntries();
    const found = all.find((item) => item.id === animeId && item.type === "anime");
    if (found) {
      return {
        id: found.id,
        type: "anime",
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
  const [loading, setLoading] = useState<boolean>(() => {
    const all = loadEntries();
    return !all.some((item) => item.id === animeId && item.type === "anime");
  });

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>(() =>
    loadFranchiseEntries()
  );
  const [relatedList, setRelatedList] = useState<JikanRelation[]>([]);
  const [activeInfoTab, setActiveInfoTab] = useState<"overview" | "characters" | "seasons">("overview");

  // Keep selectedSeasonId synchronized to animeId on initial navigation
  useEffect(() => {
    if (Number.isFinite(animeId)) {
      Promise.resolve().then(() => {
        setSelectedSeasonId(animeId);
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

  const seasonStatus: OkamiStatus =
    entry?.status ??
    (currentSeasonProgress?.status === "WATCHING"
      ? "watching"
      : currentSeasonProgress?.status === "COMPLETED"
        ? "completed"
        : currentSeasonProgress?.status === "ON_HOLD"
          ? "on_hold"
          : currentSeasonProgress?.status === "DROPPED"
            ? "dropped"
            : "plan_to_watch");

  const commitEntries = (next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const commitFranchises = (next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  };

  // Toggle or set season status (COMPLETED, WATCHING, PLAN_TO_WATCH)
  const handleToggleSeasonStatus = (seasonMalId: number, targetStatus: WatchStatus) => {
    const now = getNow();
    const isTargetViewed = seasonMalId === selectedSeasonId;
    const currentMedia = isTargetViewed ? media : null;

    const mappedEntryStatus: OkamiStatus =
      targetStatus === "COMPLETED"
        ? "completed"
        : targetStatus === "WATCHING"
          ? "watching"
          : targetStatus === "ON_HOLD"
            ? "on_hold"
            : targetStatus === "DROPPED"
              ? "dropped"
              : "plan_to_watch";

    // 1. Update Unified Franchise Entry
    if (franchiseGraph) {
      const franchiseId = franchiseGraph.franchiseId;
      const targetSeasonNode = franchiseGraph.seasons.find((s) => s.malId === seasonMalId);
      const extraNode = franchiseGraph.extras.find((e) => e.malId === seasonMalId);
      const seasonNumber = targetSeasonNode ? targetSeasonNode.seasonNumber : 1;

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
          activeSeasonMalId: seasonMalId,
          seasons: {},
        },
      };

      const existingSeason = currentFranchise.anime?.seasons?.[seasonMalId];
      const totalEpisodes =
        targetSeasonNode?.episodes ??
        extraNode?.episodes ??
        (isTargetViewed ? media?.total ?? 12 : 12);

      const epsWatched =
        targetStatus === "COMPLETED"
          ? totalEpisodes
          : targetStatus === "WATCHING"
            ? Math.max(1, existingSeason?.episodesWatched || 1)
            : 0;

      const updatedSeason: SeasonProgress = {
        malId: seasonMalId,
        title:
          targetSeasonNode?.title ??
          extraNode?.title ??
          (isTargetViewed ? media?.title ?? `Season ${seasonNumber}` : `Season ${seasonNumber}`),
        titleEnglish:
          targetSeasonNode?.titleEnglish ??
          (isTargetViewed ? media?.title_english ?? null : null),
        coverImage:
          targetSeasonNode?.cover ??
          extraNode?.cover ??
          (isTargetViewed ? media?.cover ?? "" : ""),
        type:
          (targetSeasonNode?.type as "TV" | "Movie" | "OVA" | "Special" | "ONA") ??
          (extraNode?.type as "TV" | "Movie" | "OVA" | "Special" | "ONA") ??
          "TV",
        seasonNumber,
        episodesWatched: epsWatched,
        totalEpisodes,
        watchedEpisodeIds:
          targetStatus === "COMPLETED"
            ? Array.from({ length: totalEpisodes }, (_, i) => i + 1)
            : [],
        status: targetStatus,
        score: existingSeason?.score ?? 0,
        notes: existingSeason?.notes || "",
        updatedAt: now,
        completedAt: targetStatus === "COMPLETED" ? now : undefined,
      };

      const seasonsMap: Record<number, SeasonProgress> = {
        ...(currentFranchise.anime?.seasons ?? {}),
        [seasonMalId]: updatedSeason,
      };

      const allCompleted = Object.values(seasonsMap).every((s) => s.status === "COMPLETED");
      const anyWatching = Object.values(seasonsMap).some((s) => s.status === "WATCHING");
      const overallStatus: WatchStatus = allCompleted
        ? "COMPLETED"
        : anyWatching
          ? "WATCHING"
          : "PLAN_TO_WATCH";

      const nextFranchise: UnifiedFranchiseEntry = {
        ...currentFranchise,
        updatedAt: now,
        completedAt: allCompleted ? now : currentFranchise.completedAt,
        anime: {
          overallStatus,
          activeSeasonMalId: seasonMalId,
          seasons: seasonsMap,
        },
      };

      commitFranchises({
        ...franchises,
        [franchiseId]: nextFranchise,
      });
    }

    // 2. Update local library entries
    const existingEntry = entries.find((e) => e.id === seasonMalId && e.type === "anime");
    let nextEntries: OkamiEntry[];

    if (existingEntry) {
      nextEntries = updateEntry(entries, seasonMalId, "anime", {
        status: mappedEntryStatus,
      });
      commitEntries(nextEntries);
    } else if (currentMedia) {
      const nextEntry = {
        ...buildEntry(currentMedia),
        status: mappedEntryStatus,
      };
      nextEntries = addEntry(entries, nextEntry);
      commitEntries(nextEntries);
    }
  };

  const handleMarkAllSeasonsComplete = () => {
    if (!franchiseGraph) return;
    const now = getNow();
    const franchiseId = franchiseGraph.franchiseId;

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
        overallStatus: "COMPLETED" as WatchStatus,
        activeSeasonMalId: selectedSeasonId,
        seasons: {},
      },
    };

    const updatedSeasons: Record<number, SeasonProgress> = {
      ...(currentFranchise.anime?.seasons ?? {}),
    };

    for (const s of franchiseGraph.seasons) {
      const eps = s.episodes ?? 12;
      updatedSeasons[s.malId] = {
        malId: s.malId,
        title: s.title,
        titleEnglish: s.titleEnglish ?? null,
        coverImage: s.cover,
        type: (s.type as "TV" | "Movie" | "OVA" | "Special" | "ONA") ?? "TV",
        seasonNumber: s.seasonNumber,
        episodesWatched: eps,
        totalEpisodes: eps,
        watchedEpisodeIds: Array.from({ length: eps }, (_, i) => i + 1),
        status: "COMPLETED",
        score: updatedSeasons[s.malId]?.score ?? 0,
        notes: updatedSeasons[s.malId]?.notes || "",
        updatedAt: now,
        completedAt: now,
      };
    }

    const nextFranchise: UnifiedFranchiseEntry = {
      ...currentFranchise,
      updatedAt: now,
      completedAt: now,
      anime: {
        overallStatus: "COMPLETED",
        activeSeasonMalId: selectedSeasonId,
        seasons: updatedSeasons,
      },
    };

    commitFranchises({
      ...franchises,
      [franchiseId]: nextFranchise,
    });

    let nextEntries = [...entries];
    for (const s of franchiseGraph.seasons) {
      const existing = nextEntries.find((e) => e.id === s.malId && e.type === "anime");
      if (existing) {
        nextEntries = updateEntry(nextEntries, s.malId, "anime", {
          status: "completed",
        });
      }
    }

    if (entry) {
      nextEntries = updateEntry(nextEntries, entry.id, "anime", {
        status: "completed",
      });
    } else if (media) {
      nextEntries = addEntry(nextEntries, {
        ...buildEntry(media),
        status: "completed",
      });
    }

    commitEntries(nextEntries);
  };

  const handleAdd = () => {
    if (!media || entry) return;
    const nextEntry = buildEntry(media);
    commitEntries(addEntry(entries, nextEntry));
    handleToggleSeasonStatus(selectedSeasonId, "PLAN_TO_WATCH");
  };

  const handleStatusChange = (value: OkamiStatus) => {
    const targetWatchStatus: WatchStatus =
      value === "watching"
        ? "WATCHING"
        : value === "completed"
          ? "COMPLETED"
          : value === "on_hold"
            ? "ON_HOLD"
            : value === "dropped"
              ? "DROPPED"
              : "PLAN_TO_WATCH";
    handleToggleSeasonStatus(selectedSeasonId, targetWatchStatus);
  };

  // Switch season inside tracker
  const handleSelectSeason = async (seasonMalId: number) => {
    if (seasonMalId === selectedSeasonId) return;
    setSelectedSeasonId(seasonMalId);

    try {
      const newDetail = await fetchDetail("anime", seasonMalId);
      if (newDetail) {
        setMedia(newDetail);
      }
    } catch {
      // Keep existing on failure
    }
  };

  // Initial load
  useEffect(() => {
    if (!Number.isFinite(animeId)) return;

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
      try {
        const detail = await fetchDetail("anime", animeId);
        if (!active) return;
        setMedia(detail);
        setLoading(false);
      } catch {
        if (!active) return;
        setLoading(false);
      }

      // Stream in cast, franchise graph, and related in parallel in the background
      fetchCharacters(animeId, "anime")
        .then((cast) => { if (active && cast) setCharacters(cast); })
        .catch(() => {});

      fetchFranchiseGraph(animeId, "anime")
        .then((graph) => { if (active && graph) setFranchiseGraph(graph); })
        .catch(() => {});

      fetchRelated("anime", animeId)
        .then((related) => { if (active && related) setRelatedList(related); })
        .catch(() => {});
    };

    load();

    return () => {
      active = false;
    };
  }, [animeId, entry]);

  // Compute Total Franchise Progress across all seasons
  const franchiseStats = useMemo(() => {
    if (!franchiseGraph) return null;

    const seasonEntries = franchiseGraph.seasons;
    const totalSeasons = seasonEntries.length;
    let completedSeasons = 0;

    seasonEntries.forEach((s) => {
      const storedEntry = entries.find((e) => e.id === s.malId && e.type === "anime");
      const franchiseSeason = franchise?.anime?.seasons?.[s.malId];
      if (franchiseSeason?.status === "COMPLETED" || storedEntry?.status === "completed") {
        completedSeasons += 1;
      }
    });

    const percent =
      totalSeasons > 0 ? Math.min(100, Math.round((completedSeasons / totalSeasons) * 100)) : 0;

    return { totalSeasons, completedSeasons, percent };
  }, [franchiseGraph, franchise, entries]);

  const linkedManga = franchiseGraph?.adaptations?.[0] ?? null;
  const allSeasons = useMemo(() => franchiseGraph?.seasons ?? [], [franchiseGraph]);
  const allExtras = useMemo(() => franchiseGraph?.extras ?? [], [franchiseGraph]);

  const { relatedAnime, relatedManga } = useMemo(() => {
    const existingAnimeIds = new Set([
      animeId,
      selectedSeasonId,
      ...allSeasons.map((s) => s.malId),
      ...allExtras.map((e) => e.malId),
    ]);
    const existingMangaIds = new Set(linkedManga ? [linkedManga.malId] : []);

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
  }, [relatedList, animeId, selectedSeasonId, allSeasons, allExtras, linkedManga]);

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

      {/* Franchise Banner & Season Progress */}
      {franchiseGraph && (
        <div className="franchise-strip-banner">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="franchise-strip-badge">UNIFIED FRANCHISE COMMAND CENTER</div>
            {franchiseStats && franchiseStats.totalSeasons > 1 ? (
              <span className="franchise-strip-meta accent-text">
                {franchiseStats.completedSeasons} / {franchiseStats.totalSeasons} Seasons Completed ({franchiseStats.percent}%)
              </span>
            ) : null}
          </div>
          <div className="franchise-strip-title">{franchiseGraph.title}</div>

          {/* Season Progress Bar */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {franchiseStats && franchiseStats.totalSeasons > 1 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                  <span>FRANCHISE SEASONS PROGRESS ({franchiseStats.totalSeasons} Seasons)</span>
                  <span>{franchiseStats.completedSeasons} / {franchiseStats.totalSeasons} Seasons ({franchiseStats.percent}%)</span>
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
        {/* Left Column: Canon Seasons Tracker (No episodes, pure seasons!) */}
        <div className="detail-card detail-episodes-card">
          <div className="detail-section">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <div className="detail-section-title" style={{ margin: 0 }}>
                  Canon Seasons & Franchise Releases
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  {allSeasons.length > 1
                    ? `${allSeasons.length} canon seasons in franchise • Track season-by-season`
                    : "Single season release • Track season completion"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {allSeasons.length > 1 && (
                  <button
                    type="button"
                    className="btn-text-link"
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid var(--teal)",
                      background: "rgba(43, 217, 199, 0.1)",
                      color: "var(--teal)",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                    onClick={handleMarkAllSeasonsComplete}
                    title="Mark all franchise seasons as completed"
                  >
                    ✓ Mark All Seasons Completed
                  </button>
                )}
              </div>
            </div>

            {/* Canon Seasons Cards List */}
            <div className="season-cards-list">
              {(allSeasons.length > 0
                ? allSeasons
                : [
                    {
                      malId: media?.id ?? animeId,
                      title: media?.title ?? "Season 1",
                      titleEnglish: media?.title_english ?? null,
                      cover: media?.cover ?? "",
                      seasonNumber: 1,
                      type: media?.format || "TV",
                      year: media?.year,
                      episodes: media?.total ?? null,
                    },
                  ]
              ).map((season) => {
                const isCurrent = season.malId === selectedSeasonId;
                const franchiseSeason = franchise?.anime?.seasons?.[season.malId];
                const storedEntry = entries.find((e) => e.id === season.malId && e.type === "anime");
                const status: WatchStatus =
                  franchiseSeason?.status ??
                  (storedEntry?.status === "completed"
                    ? "COMPLETED"
                    : storedEntry?.status === "watching"
                      ? "WATCHING"
                      : storedEntry?.status === "on_hold"
                        ? "ON_HOLD"
                        : storedEntry?.status === "dropped"
                          ? "DROPPED"
                          : "PLAN_TO_WATCH");

                const isCompleted = status === "COMPLETED";
                const isWatching = status === "WATCHING";
                const isPlan = status === "PLAN_TO_WATCH";

                return (
                  <div
                    key={season.malId}
                    className={`season-card ${isCurrent ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                    onClick={() => handleSelectSeason(season.malId)}
                  >
                    <img
                      src={season.cover || media?.cover}
                      alt={season.title}
                      className="season-card-thumb"
                    />
                    <div className="season-card-body">
                      <div className="season-card-header">
                        <span className="season-card-format">
                          S{season.seasonNumber} • {season.type || "TV"}
                        </span>
                        <span className={`season-status-tag ${status.toLowerCase()}`}>
                          {status === "COMPLETED"
                            ? "Completed"
                            : status === "WATCHING"
                              ? "Watching"
                              : "Plan to Watch"}
                        </span>
                        {isCurrent && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--accent)",
                              background: "rgba(232, 25, 75, 0.12)",
                              padding: "2px 6px",
                              borderRadius: 3,
                            }}
                          >
                            CURRENT VIEW
                          </span>
                        )}
                      </div>
                      <div className="season-card-title" title={season.title}>
                        {season.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {season.year || "--"} • {season.episodes ? `${season.episodes} eps` : "Ongoing Broadcast"}
                      </div>
                      <div
                        className="season-card-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={`season-action-btn ${isCompleted ? "active-done" : ""}`}
                          onClick={() => handleToggleSeasonStatus(season.malId, "COMPLETED")}
                          title="Mark this season completed"
                        >
                          ✓ Complete
                        </button>
                        <button
                          type="button"
                          className={`season-action-btn ${isWatching ? "active-watching" : ""}`}
                          onClick={() => handleToggleSeasonStatus(season.malId, "WATCHING")}
                          title="Mark this season currently watching"
                        >
                          ▶ Watching
                        </button>
                        <button
                          type="button"
                          className={`season-action-btn ${isPlan ? "active-plan" : ""}`}
                          onClick={() => handleToggleSeasonStatus(season.malId, "PLAN_TO_WATCH")}
                          title="Set to plan to watch"
                        >
                          + Plan
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Movies, OVAs & Extras */}
              {allExtras.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-3)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                    }}
                  >
                    Movies, OVAs & Specials ({allExtras.length})
                  </div>
                  <div className="season-cards-list">
                    {allExtras.map((extra) => {
                      const isCurrent = extra.malId === selectedSeasonId;
                      const franchiseSeason = franchise?.anime?.seasons?.[extra.malId];
                      const storedEntry = entries.find((e) => e.id === extra.malId && e.type === "anime");
                      const status: WatchStatus =
                        franchiseSeason?.status ??
                        (storedEntry?.status === "completed"
                          ? "COMPLETED"
                          : storedEntry?.status === "watching"
                            ? "WATCHING"
                            : "PLAN_TO_WATCH");
                      const isCompleted = status === "COMPLETED";

                      return (
                        <div
                          key={extra.malId}
                          className={`season-card ${isCurrent ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                          onClick={() => handleSelectSeason(extra.malId)}
                        >
                          <img
                            src={extra.cover || media?.cover}
                            alt={extra.title}
                            className="season-card-thumb"
                          />
                          <div className="season-card-body">
                            <div className="season-card-header">
                              <span className="season-card-format">{extra.type}</span>
                              <span className={`season-status-tag ${status.toLowerCase()}`}>
                                {status === "COMPLETED" ? "Completed" : status === "WATCHING" ? "Watching" : "Plan"}
                              </span>
                            </div>
                            <div className="season-card-title" title={extra.title}>
                              {extra.title}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                              {extra.year || "--"} • {extra.episodes ? `${extra.episodes} eps` : "Special"}
                            </div>
                            <div
                              className="season-card-actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={`season-action-btn ${isCompleted ? "active-done" : ""}`}
                                onClick={() => handleToggleSeasonStatus(extra.malId, "COMPLETED")}
                              >
                                ✓ Complete
                              </button>
                              <button
                                type="button"
                                className="season-action-btn"
                                onClick={() => handleToggleSeasonStatus(extra.malId, "PLAN_TO_WATCH")}
                              >
                                + Plan
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Overview, Cast & Franchise Hub */}
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
            {franchiseGraph || relatedList.length > 0 ? (
              <button
                className={`detail-tab ${activeInfoTab === "seasons" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveInfoTab("seasons")}
              >
                Franchise &amp; Related
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
                      <span className="info-label">Status</span>
                      <span className="info-value">
                        {media.status ? media.status.replace(/_/g, " ") : "Ongoing"}
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
                  <div className="detail-section-title">Active Season Status</div>
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
                <div className="detail-section-title">Franchise Universe &amp; Related Series</div>

                {/* ── Section 1: ANIME RELEASES & RELATED ── */}
                <div className="franchise-section-divider">
                  <span className="franchise-section-badge anime">Anime Releases</span>
                  <span className="franchise-section-count">
                    {allSeasons.length + allExtras.length + relatedAnime.length} Titles
                  </span>
                </div>

                {/* Mainline Seasons List */}
                {allSeasons.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="franchise-group-title">Mainline Chronological Seasons</div>
                    <div className="franchise-nodes-list">
                      {allSeasons.map((season) => {
                        const isCurrent = season.malId === selectedSeasonId;
                        const franchiseSeason = franchise?.anime?.seasons?.[season.malId];
                        const stored = entries.find((e) => e.id === season.malId);
                        const isDone = franchiseSeason?.status === "COMPLETED" || stored?.status === "completed";
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
                                {isDone ? " • Completed" : ""}
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
                                View →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Movies & Extras */}
                {allExtras.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="franchise-group-title">Theatrical Films &amp; Specials</div>
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
                            View →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Anime Series (Prequels, Sequels, Spin-offs, Side stories) */}
                {relatedAnime.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="franchise-group-title">Related Anime Series &amp; Spin-Offs</div>
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
                            href={`/anime/${item.mal_id}`}
                            title={`View ${item.name}`}
                          >
                            View Anime →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Section 2: MANGA & PRINT PUBLICATIONS ── */}
                <div className="franchise-section-divider" style={{ marginTop: 24 }}>
                  <span className="franchise-section-badge manga">Manga &amp; Print Publications</span>
                  <span className="franchise-section-count">
                    {(linkedManga ? 1 : 0) + relatedManga.length} Titles
                  </span>
                </div>

                {/* Linked Manga Adaptation */}
                {linkedManga && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="franchise-group-title">Source / Original Manga</div>
                    <div className="franchise-node-item">
                      <img className="franchise-node-thumb" src={linkedManga.cover} alt={linkedManga.title} />
                      <div style={{ flex: 1 }}>
                        <div className="franchise-node-title">{linkedManga.title}</div>
                        <div className="franchise-node-sub">
                          {linkedManga.type} • {linkedManga.year || "--"}
                          {linkedManga.chapters ? ` • ${linkedManga.chapters} chapters` : ""}
                        </div>
                      </div>
                      <Link className="franchise-node-action manga" href={`/manga/${linkedManga.malId}`}>
                        Open Manga Tracker →
                      </Link>
                    </div>
                  </div>
                )}

                {/* Related Manga & Light Novels */}
                {relatedManga.length > 0 ? (
                  <div>
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
                            href={`/manga/${item.mal_id}`}
                            title={`Open ${item.name}`}
                          >
                            Open Manga Tracker →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !linkedManga ? (
                  <div className="detail-empty">No print adaptations recorded.</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
