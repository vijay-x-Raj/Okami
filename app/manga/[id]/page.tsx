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
  JikanRelation,
  OkamiMedia,
} from "@/app/lib/jikan";
import {
  fetchCharacters,
  fetchDetail,
  fetchFranchiseGraph,
  fetchRelated,
  fetchVolumes,
  type MangaVolumeItem,
} from "@/app/lib/api";
import {
  addEntry,
  getFranchiseByMalId,
  loadEntries,
  loadFranchiseEntries,
  saveEntries,
  saveFranchiseEntries,
  updateEntry,
  type MangaProgress,
  type OkamiEntry,
  type OkamiStatus,
  type ReadStatus,
  type UnifiedFranchiseEntry,
} from "@/app/lib/storage";

const STATUS_OPTIONS: Array<{ value: ReadStatus; label: string; legacy: OkamiStatus }> = [
  { value: "READING", label: "Reading", legacy: "watching" },
  { value: "COMPLETED", label: "Completed", legacy: "completed" },
  { value: "ON_HOLD", label: "On Hold", legacy: "on_hold" },
  { value: "DROPPED", label: "Dropped", legacy: "dropped" },
  { value: "PLAN_TO_READ", label: "Plan to Read", legacy: "plan_to_watch" },
];

function buildMangaEntry(media: OkamiMedia, existing?: OkamiEntry): OkamiEntry {
  return {
    id: media.id,
    type: "manga",
    title: media.title,
    cover: media.cover,
    year: media.year,
    format: media.format,
    genres: media.genres,
    official_score: media.official_score,
    user_score: existing?.user_score ?? null,
    status: existing?.status ?? "plan_to_watch",
    progress: existing?.progress ?? 0,
    total: media.total ?? null,
    completed_seasons: [],
    completed_volumes: existing?.completed_volumes ?? [],
    completed_episodes: [],
    date_added: existing?.date_added ?? new Date().toISOString(),
    notes: existing?.notes ?? media.synopsis ?? "",
    is_favourite: existing?.is_favourite ?? false,
  };
}

export default function MangaTrackerPage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const mangaId = rawId ? Number(rawId) : Number.NaN;

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
  const [volumes, setVolumes] = useState<MangaVolumeItem[]>([]);
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [relatedList, setRelatedList] = useState<JikanRelation[]>([]);
  const [loading, setLoading] = useState<boolean>(() => {
    const all = loadEntries();
    return !all.some((item) => item.id === mangaId && item.type === "manga");
  });
  const [activeInfoTab, setActiveInfoTab] = useState<"overview" | "characters" | "franchise">("overview");

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>(() =>
    loadFranchiseEntries()
  );

  const entry = useMemo(
    () => entries.find((item) => item.id === mangaId && item.type === "manga"),
    [entries, mangaId]
  );

  const franchise = useMemo(() => {
    if (franchiseGraph) {
      return franchises[franchiseGraph.franchiseId] ?? null;
    }
    return getFranchiseByMalId(franchises, mangaId) ?? null;
  }, [franchises, franchiseGraph, mangaId]);

  const mangaProgress: MangaProgress | undefined = franchise?.manga?.series?.[mangaId];
  const chaptersRead = mangaProgress?.chaptersRead ?? entry?.progress ?? 0;
  const volumesRead = mangaProgress?.volumesRead ?? entry?.completed_volumes?.length ?? 0;
  const completedVolumesList = mangaProgress?.readVolumeNumbers ?? entry?.completed_volumes ?? [];
  const readStatus: ReadStatus = mangaProgress?.status ?? (entry?.status === "completed" ? "COMPLETED" : entry?.status === "watching" ? "READING" : entry?.status === "on_hold" ? "ON_HOLD" : entry?.status === "dropped" ? "DROPPED" : "PLAN_TO_READ");

  const totalChapters = media?.chapters ?? media?.total ?? null;
  const totalVolumes = media?.volumes ?? (volumes.length > 0 ? volumes.length : null);

  const commitEntries = (next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const commitFranchises = (next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  };

  // Synchronize progress to both legacy OkamiEntry and UnifiedFranchiseEntry
  const handleUpdateProgress = (
    newChapters: number,
    newVolumes: number,
    newStatus?: ReadStatus,
    newReadVolumes?: number[]
  ) => {
    if (!media) return;

    const clampedChapters = Math.max(0, newChapters);
    const clampedVolumes = Math.max(0, newVolumes);

    // Auto-complete status check
    let status = newStatus ?? readStatus;
    if (totalChapters !== null && totalChapters > 0 && clampedChapters >= totalChapters) {
      status = "COMPLETED";
    } else if (status === "PLAN_TO_READ" && (clampedChapters > 0 || clampedVolumes > 0)) {
      status = "READING";
    }

    const legacyStatus: OkamiStatus =
      status === "READING"
        ? "watching"
        : status === "COMPLETED"
          ? "completed"
          : status === "ON_HOLD"
            ? "on_hold"
            : status === "DROPPED"
              ? "dropped"
              : "plan_to_watch";

    const updatedVolumeNumbers = newReadVolumes ?? completedVolumesList;

    // 1. Update legacy entry
    if (entry) {
      commitEntries(
        updateEntry(entries, mangaId, "manga", {
          progress: clampedChapters,
          status: legacyStatus,
          completed_volumes: updatedVolumeNumbers,
        })
      );
    } else {
      const nextEntry: OkamiEntry = {
        ...buildMangaEntry(media),
        progress: clampedChapters,
        status: legacyStatus,
        completed_volumes: updatedVolumeNumbers,
      };
      commitEntries(addEntry(entries, nextEntry));
    }

    // 2. Update UnifiedFranchiseEntry
    const franchiseId = franchiseGraph ? franchiseGraph.franchiseId : `franchise_${mangaId}`;
    const now = getNow();
    const currentFranchise: UnifiedFranchiseEntry = franchises[franchiseId] ?? {
      franchiseId,
      rootMalId: franchiseGraph ? franchiseGraph.rootMalId : mangaId,
      title: franchiseGraph ? franchiseGraph.title : media.title,
      coverImage: media.cover,
      genres: media.genres || [],
      addedAt: now,
      updatedAt: now,
      isFavorite: false,
      linkedMalIds: [mangaId],
      manga: {
        overallStatus: status,
        activeMangaMalId: mangaId,
        series: {},
      },
    };

    const updatedMangaRecord: MangaProgress = {
      malId: mangaId,
      title: media.title,
      titleEnglish: media.title_english ?? null,
      coverImage: media.cover,
      format: media.format || "Manga",
      chaptersRead: clampedChapters,
      totalChapters: totalChapters ?? 0,
      volumesRead: clampedVolumes,
      totalVolumes: totalVolumes ?? 0,
      readVolumeNumbers: updatedVolumeNumbers,
      status,
      score: entry?.user_score ?? 0,
      notes: entry?.notes || "",
      updatedAt: now,
    };

    const nextSeries = {
      ...(currentFranchise.manga?.series ?? {}),
      [mangaId]: updatedMangaRecord,
    };

    const allCompleted = Object.values(nextSeries).every((m) => m.status === "COMPLETED");
    const overallStatus: ReadStatus = allCompleted
      ? "COMPLETED"
      : status === "PLAN_TO_READ"
        ? "PLAN_TO_READ"
        : "READING";

    const nextFranchises: Record<string, UnifiedFranchiseEntry> = {
      ...franchises,
      [franchiseId]: {
        ...currentFranchise,
        updatedAt: now,
        manga: {
          overallStatus,
          activeMangaMalId: mangaId,
          series: nextSeries,
        },
      },
    };

    commitFranchises(nextFranchises);
  };

  const handleAdd = () => {
    if (!media || entry) return;
    const nextEntry = buildMangaEntry(media);
    commitEntries(addEntry(entries, nextEntry));
    handleUpdateProgress(0, 0, "PLAN_TO_READ");
  };

  const handleStatusChange = (newStatus: ReadStatus) => {
    handleUpdateProgress(chaptersRead, volumesRead, newStatus);
  };

  const toggleVolume = (volNum: number) => {
    const isCompleted = completedVolumesList.includes(volNum);
    const nextCompleted = isCompleted
      ? completedVolumesList.filter((v) => v !== volNum)
      : [...completedVolumesList, volNum].sort((a, b) => a - b);

    handleUpdateProgress(chaptersRead, nextCompleted.length, undefined, nextCompleted);
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
      setVolumes([]);
      setCharacters([]);
      setFranchiseGraph(null);
      setRelatedList([]);
    });

    const load = async () => {
      try {
        const detail = await fetchDetail("manga", mangaId);
        if (!active) return;
        setMedia(detail);
        setLoading(false);
      } catch {
        if (!active) return;
        setLoading(false);
      }

      // Stream in volumes, cast, franchise graph, and related in parallel
      fetchVolumes(mangaId)
        .then((volData) => { if (active && volData?.volumes) setVolumes(volData.volumes); })
        .catch(() => {});

      fetchCharacters(mangaId, "manga")
        .then((cast) => { if (active && cast) setCharacters(cast); })
        .catch(() => {});

      fetchFranchiseGraph(mangaId, "manga")
        .then((graph) => { if (active && graph) setFranchiseGraph(graph); })
        .catch(() => {});

      fetchRelated("manga", mangaId)
        .then((related) => { if (active && related) setRelatedList(related); })
        .catch(() => {});
    };

    load();

    return () => {
      active = false;
    };
  }, [mangaId, entry]);

  // Find linked anime adaptation if any
  const linkedAnimeSeason = franchiseGraph?.seasons?.[0] ?? franchiseGraph?.extras?.[0] ?? null;

  // Percentage calculations
  const chapterPercent =
    totalChapters && totalChapters > 0
      ? Math.min(100, Math.round((chaptersRead / totalChapters) * 100))
      : 0;

  const volumePercent =
    totalVolumes && totalVolumes > 0
      ? Math.min(100, Math.round((volumesRead / totalVolumes) * 100))
      : 0;

  const { relatedAnime, relatedManga } = useMemo(() => {
    const existingAnimeIds = new Set([
      ...(franchiseGraph?.seasons.map((s) => s.malId) || []),
      ...(franchiseGraph?.extras.map((e) => e.malId) || []),
    ]);
    const existingMangaIds = new Set([
      mangaId,
      ...(franchiseGraph?.adaptations.map((a) => a.malId) || []),
    ]);

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
  }, [relatedList, mangaId, franchiseGraph]);

  if (!Number.isFinite(mangaId)) {
    return (
      <div className="detail-page theme-manga">
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
    <div className="detail-page theme-manga">
      <div className="detail-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="back-link" href="/">
            ← Back to Library
          </Link>
          {media ? <span className="detail-page-id">MAL Manga #{media.id}</span> : null}
          {media ? (
            <Link className="adaptation-pill manga-link" href={`/manga/${media.id}/info`}>
              ℹ View Full Manga Info →
            </Link>
          ) : null}
        </div>
        {linkedAnimeSeason ? (
          <Link
            className="adaptation-pill anime-link"
            href={`/anime/${linkedAnimeSeason.malId}`}
            title="Open linked Anime adaptation"
          >
            Switch to Anime Tracker: {linkedAnimeSeason.title} →
          </Link>
        ) : null}
      </div>

      {/* Franchise Banner & Dual Progress */}
      {franchiseGraph && (
        <div className="franchise-strip-banner">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="franchise-strip-badge">UNIFIED MANGA & LIGHT NOVEL TRACKER</div>
            {linkedAnimeSeason && (
              <span className="franchise-strip-meta accent-text">
                Anime Adaptation: {linkedAnimeSeason.title}
              </span>
            )}
          </div>
          <div className="franchise-strip-title">{franchiseGraph.title}</div>

          {/* Dual Progress Bars */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                <span>CHAPTERS READ</span>
                <span>{chaptersRead} / {totalChapters ? `${totalChapters} chs` : "?"} ({chapterPercent}%)</span>
              </div>
              <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${chapterPercent}%`,
                    background: "var(--manga-accent)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                <span>VOLUMES COMPLETED</span>
                <span>{volumesRead} / {totalVolumes ? `${totalVolumes} vols` : "?"} ({volumePercent}%)</span>
              </div>
              <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${volumePercent}%`,
                    background: "var(--gold)",
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
                    {totalChapters ? `${totalChapters} chs` : "Ongoing chapters"}
                    {totalVolumes ? ` / ${totalVolumes} vols` : ""}
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
              <Link className="modal-btn secondary-manga" href={`/manga/${media.id}/info`}>
                Full Overview &amp; Cast →
              </Link>
              {linkedAnimeSeason ? (
                <Link className="modal-btn secondary-anime" href={`/anime/${linkedAnimeSeason.malId}`}>
                  Open Anime Tracker →
                </Link>
              ) : null}
              <span className="detail-score">
                <span className="detail-score-label">MAL Score</span>
                <span className="detail-score-value">
                  ★ {media.official_score ? media.official_score.toFixed(1) : "--"}
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="detail-lower-grid">
        {/* Left Column: Chapter & Volume Tracker Controls */}
        <div className="detail-card detail-manga-tracker-card">
          <div className="detail-section">
            <div className="detail-section-title">Manga Reading Tracker</div>

            {/* Reading Status Selector */}
            <div style={{ marginBottom: 20 }}>
              <span className="field-label" style={{ display: "block", marginBottom: 8 }}>Reading Status</span>
              <div className="status-button-row" role="group" aria-label="Reading status">
                {STATUS_OPTIONS.map((option) => {
                  const active = readStatus === option.value;
                  const statusClass = option.value.toLowerCase().replace(/_/g, "-");
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
            </div>

            {/* Steppers & Numerical Inputs */}
            <div className="manga-tracker-steppers" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Chapter Stepper */}
              <div className="stepper-box">
                <div className="stepper-header">
                  <span className="stepper-label">CHAPTERS READ</span>
                  <span className="stepper-total">
                    / {totalChapters ? `${totalChapters} chs` : "Ongoing"}
                  </span>
                </div>
                <div className="stepper-controls">
                  <button
                    className="stepper-btn"
                    type="button"
                    onClick={() => handleUpdateProgress(chaptersRead - 1, volumesRead)}
                    disabled={chaptersRead <= 0}
                    title="Previous chapter"
                  >
                    -1
                  </button>
                  <input
                    className="stepper-input"
                    type="number"
                    min={0}
                    max={totalChapters ?? 99999}
                    value={chaptersRead}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) handleUpdateProgress(val, volumesRead);
                    }}
                  />
                  <button
                    className="stepper-btn primary"
                    type="button"
                    onClick={() => handleUpdateProgress(chaptersRead + 1, volumesRead)}
                    title="Quick +1 chapter read"
                  >
                    +1 Ch
                  </button>
                  <button
                    className="stepper-btn secondary"
                    type="button"
                    onClick={() => handleUpdateProgress(chaptersRead + 5, volumesRead)}
                    title="+5 chapters"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Volume Stepper */}
              <div className="stepper-box">
                <div className="stepper-header">
                  <span className="stepper-label">VOLUMES READ</span>
                  <span className="stepper-total">
                    / {totalVolumes ? `${totalVolumes} vols` : "Ongoing"}
                  </span>
                </div>
                <div className="stepper-controls">
                  <button
                    className="stepper-btn"
                    type="button"
                    onClick={() => handleUpdateProgress(chaptersRead, volumesRead - 1)}
                    disabled={volumesRead <= 0}
                    title="Previous volume"
                  >
                    -1
                  </button>
                  <input
                    className="stepper-input"
                    type="number"
                    min={0}
                    max={totalVolumes ?? 999}
                    value={volumesRead}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) handleUpdateProgress(chaptersRead, val);
                    }}
                  />
                  <button
                    className="stepper-btn primary"
                    type="button"
                    onClick={() => handleUpdateProgress(chaptersRead, volumesRead + 1)}
                    title="Quick +1 volume read"
                  >
                    +1 Vol
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Volume Shelf Grid */}
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div className="detail-section-title" style={{ margin: 0 }}>
                  Volume Shelf Checklist ({completedVolumesList.length} / {volumes.length || totalVolumes || "?"} read)
                </div>
                {volumes.length > 0 ? (
                  <button
                    className="btn-text-link"
                    type="button"
                    onClick={() => {
                      const allVols = volumes.map((v) => v.volumeNumber);
                      if (completedVolumesList.length === allVols.length) {
                        handleUpdateProgress(chaptersRead, 0, undefined, []);
                      } else {
                        handleUpdateProgress(chaptersRead, allVols.length, undefined, allVols);
                      }
                    }}
                  >
                    {completedVolumesList.length === volumes.length
                      ? "Unmark All"
                      : "Mark All Volumes Read"}
                  </button>
                ) : null}
              </div>

              {volumes.length === 0 ? (
                <div className="detail-empty">No volume breakdown available.</div>
              ) : (
                <div
                  className="custom-scroll"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                    gap: 12,
                    maxHeight: 480,
                    overflowY: "auto",
                    padding: 4,
                  }}
                >
                  {volumes.map((vol) => {
                    const isRead = completedVolumesList.includes(vol.volumeNumber);
                    return (
                      <div
                        key={vol.volumeNumber}
                        onClick={() => toggleVolume(vol.volumeNumber)}
                        style={{
                          background: isRead ? "var(--surface-3)" : "var(--surface-2)",
                          border: `1px solid ${isRead ? "var(--manga-accent)" : "var(--border)"}`,
                          borderRadius: 4,
                          padding: 6,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          transition: "all 0.15s ease",
                          position: "relative",
                        }}
                      >
                        <div style={{ width: "100%", height: 130, position: "relative", marginBottom: 6, overflow: "hidden", borderRadius: 2 }}>
                          <img
                            src={vol.coverUrl}
                            alt={vol.title}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              filter: isRead ? "none" : "grayscale(0.3) opacity(0.8)",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              background: isRead ? "var(--manga-accent)" : "rgba(0,0,0,0.6)",
                              color: isRead ? "#FFFFFF" : "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {isRead ? "✓" : "○"}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isRead ? "var(--text-1)" : "var(--text-2)" }}>
                          Vol. {vol.volumeNumber}
                        </span>
                        {vol.estimatedChapters && (
                          <span style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>
                            {vol.estimatedChapters}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Metadata, Characters & Franchise Media */}
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
                className={`detail-tab ${activeInfoTab === "franchise" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveInfoTab("franchise")}
              >
                Franchise &amp; Related
              </button>
            ) : null}
          </div>

          <div className="detail-info-body custom-scroll">
            {activeInfoTab === "overview" ? (
              <div className="detail-section">
                <div className="detail-section-title">Manga Metadata</div>
                {media ? (
                  <div className="detail-info-grid">
                    <div className="info-item">
                      <span className="info-label">Format</span>
                      <span className="info-value">{media.format}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Chapters</span>
                      <span className="info-value">{totalChapters ? String(totalChapters) : "Ongoing"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Volumes</span>
                      <span className="info-value">{totalVolumes ? String(totalVolumes) : "Ongoing"}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Year Published</span>
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
            ) : activeInfoTab === "characters" ? (
              <div className="detail-section">
                <div className="detail-section-title">Manga Characters</div>
                {characters.length === 0 ? (
                  <div className="detail-empty">No character data available.</div>
                ) : (
                  <div className="cast-list">
                    {characters.slice(0, 16).map((char) => (
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
            ) : (
              <div className="detail-section">
                <div className="detail-section-title">Franchise Universe &amp; Related Series</div>

                {/* ── Section 1: MANGA & PRINT PUBLICATIONS ── */}
                <div className="franchise-section-divider">
                  <span className="franchise-section-badge manga">Manga Publications</span>
                  <span className="franchise-section-count">
                    {1 + (franchiseGraph?.adaptations.filter((m) => m.malId !== mangaId).length || 0) + relatedManga.length} Titles
                  </span>
                </div>

                {/* Other Adaptations & Related Manga */}
                <div className="franchise-nodes-list" style={{ marginBottom: 20 }}>
                  {franchiseGraph && franchiseGraph.adaptations.length > 1 && (
                    franchiseGraph.adaptations
                      .filter((m) => m.malId !== mangaId)
                      .map((otherManga) => (
                        <div className="franchise-node-item" key={otherManga.malId}>
                          <img className="franchise-node-thumb" src={otherManga.cover} alt={otherManga.title} />
                          <div style={{ flex: 1 }}>
                            <div className="franchise-node-title">{otherManga.title}</div>
                            <div className="franchise-node-sub">
                              {otherManga.type} • {otherManga.year || "--"}
                            </div>
                          </div>
                          <Link className="franchise-node-action manga" href={`/manga/${otherManga.malId}`}>
                            Switch →
                          </Link>
                        </div>
                      ))
                  )}

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
                        title={`View ${item.name}`}
                      >
                        View Manga →
                      </Link>
                    </div>
                  ))}
                </div>

                {/* ── Section 2: ANIME ADAPTATIONS & BROADCASTS ── */}
                <div className="franchise-section-divider" style={{ marginTop: 24 }}>
                  <span className="franchise-section-badge anime">Anime Adaptations</span>
                  <span className="franchise-section-count">
                    {(franchiseGraph?.seasons.length || 0) + (franchiseGraph?.extras.length || 0) + relatedAnime.length} Titles
                  </span>
                </div>

                {/* Linked Anime Seasons */}
                {franchiseGraph && franchiseGraph.seasons.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="franchise-group-title">Mainline TV Seasons</div>
                    <div className="franchise-nodes-list">
                      {franchiseGraph.seasons.map((season) => (
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
                          <Link className="franchise-node-action anime" href={`/anime/${season.malId}`}>
                            Track Anime →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Anime Movies & Specials */}
                {franchiseGraph && franchiseGraph.extras.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="franchise-group-title">Theatrical Movies &amp; Specials</div>
                    <div className="franchise-nodes-list">
                      {franchiseGraph.extras.map((extra) => (
                        <div className="franchise-node-item" key={extra.malId}>
                          <img className="franchise-node-thumb" src={extra.cover} alt={extra.title} />
                          <div style={{ flex: 1 }}>
                            <div className="franchise-node-title">{extra.title}</div>
                            <div className="franchise-node-sub">
                              {extra.type} • {extra.year || "--"}
                            </div>
                          </div>
                          <Link className="franchise-node-action anime" href={`/anime/${extra.malId}`}>
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
                            className="franchise-node-action anime"
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
