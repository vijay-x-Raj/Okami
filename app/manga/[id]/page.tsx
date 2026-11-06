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
  OkamiMedia,
} from "@/app/lib/jikan";
import {
  fetchCharacters,
  fetchDetail,
  fetchFranchiseGraph,
  fetchVolumes,
  type VolumeData,
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

  const [media, setMedia] = useState<OkamiMedia | null>(null);
  const [volumes, setVolumes] = useState<VolumeData[]>([]);
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [franchiseGraph, setFranchiseGraph] = useState<FranchiseGraph | null>(null);
  const [loading, setLoading] = useState(true);
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
    if (!franchiseGraph) return null;
    return franchises[franchiseGraph.franchiseId] ?? null;
  }, [franchises, franchiseGraph]);

  const mangaProgress = franchise?.manga?.[mangaId];
  const chaptersRead = mangaProgress?.chaptersRead ?? entry?.progress ?? 0;
  const volumesRead = mangaProgress?.volumesRead ?? entry?.completed_volumes?.length ?? 0;
  const completedVolumesList = entry?.completed_volumes ?? [];
  const readStatus = mangaProgress?.status ?? "PLAN_TO_READ";

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
  const handleUpdateProgress = (newChapters: number, newVolumes: number, newStatus?: ReadStatus) => {
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

    // 1. Update legacy entry
    if (entry) {
      commitEntries(
        updateEntry(entries, mangaId, "manga", {
          progress: clampedChapters,
          status: legacyStatus,
        })
      );
    } else {
      const nextEntry: OkamiEntry = {
        ...buildMangaEntry(media),
        progress: clampedChapters,
        status: legacyStatus,
      };
      commitEntries(addEntry(entries, nextEntry));
    }

    // 2. Update franchise entry
    const franchiseId = franchiseGraph?.franchiseId ?? `franchise_${mangaId}`;
    const currentFranchise = franchises[franchiseId] ?? {
      franchiseId,
      rootMalId: franchiseGraph?.rootMalId ?? mangaId,
      title: franchiseGraph?.title ?? media.title,
      coverImage: franchiseGraph?.cover ?? media.cover,
      updatedAt: getNow(),
      manga: {},
    };

    const updatedFranchise: UnifiedFranchiseEntry = {
      ...currentFranchise,
      updatedAt: getNow(),
      manga: {
        ...(currentFranchise.manga ?? {}),
        [mangaId]: {
          malId: mangaId,
          title: media.title,
          chaptersRead: clampedChapters,
          totalChapters,
          volumesRead: clampedVolumes,
          totalVolumes,
          status,
          score: entry?.user_score ?? undefined,
        },
      },
    };

    commitFranchises({
      ...franchises,
      [franchiseId]: updatedFranchise,
    });
  };

  const handleAdd = () => {
    if (!media || entry) return;
    const newEntry = buildMangaEntry(media);
    commitEntries(addEntry(entries, newEntry));
    handleUpdateProgress(0, 0, "PLAN_TO_READ");
  };

  const handleStatusChange = (status: ReadStatus) => {
    handleUpdateProgress(chaptersRead, volumesRead, status);
  };

  const toggleVolume = (volNum: number) => {
    const isCompleted = completedVolumesList.includes(volNum);
    const nextCompleted = isCompleted
      ? completedVolumesList.filter((v) => v !== volNum)
      : [...completedVolumesList, volNum].sort((a, b) => a - b);

    if (entry) {
      commitEntries(
        updateEntry(entries, mangaId, "manga", {
          completed_volumes: nextCompleted,
        })
      );
    }

    handleUpdateProgress(chaptersRead, nextCompleted.length);
  };

  useEffect(() => {
    if (!Number.isFinite(mangaId)) return;

    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setMedia(null);
      setVolumes([]);
      setCharacters([]);
      setFranchiseGraph(null);
    });

    const load = async () => {
      try {
        const [detail, volList, cast, graph] = await Promise.all([
          fetchDetail("manga", mangaId),
          fetchVolumes(mangaId).catch(() => []),
          fetchCharacters(mangaId).catch(() => []),
          fetchFranchiseGraph(mangaId, "manga").catch(() => null),
        ]);
        if (!active) return;
        setMedia(detail);
        setVolumes(volList);
        setCharacters(cast);
        setFranchiseGraph(graph);
      } catch {
        if (!active) return;
        setMedia(null);
        setVolumes([]);
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

  // Find linked anime adaptation if any
  const linkedAnimeSeason = franchiseGraph?.seasons?.[0] ?? franchiseGraph?.extras?.[0] ?? null;

  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="back-link" href="/">
            ← Back to Library
          </Link>
          {media ? <span className="detail-page-id">MAL Manga #{media.id}</span> : null}
        </div>
        {linkedAnimeSeason ? (
          <Link
            className="adaptation-pill anime-link"
            href={`/anime/${linkedAnimeSeason.malId}`}
            title="Open linked Anime adaptation"
          >
            📺 Switch to Anime: {linkedAnimeSeason.title} →
          </Link>
        ) : null}
      </div>

      {/* Franchise Banner */}
      {franchiseGraph && (franchiseGraph.seasons.length > 0 || franchiseGraph.adaptations.length > 1) ? (
        <div className="franchise-strip-banner">
          <div className="franchise-strip-badge">UNIFIED FRANCHISE</div>
          <div className="franchise-strip-title">{franchiseGraph.title}</div>
          <div className="franchise-strip-meta">
            {franchiseGraph.seasons.length > 0 ? (
              <span>{franchiseGraph.seasons.length} Anime Seasons</span>
            ) : null}
            {franchiseGraph.adaptations.length > 0 ? (
              <span>• {franchiseGraph.adaptations.length} Manga / Novels</span>
            ) : null}
            {franchiseGraph.extras.length > 0 ? (
              <span>• {franchiseGraph.extras.length} Movies/OVAs</span>
            ) : null}
          </div>
        </div>
      ) : null}

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
              {linkedAnimeSeason ? (
                <Link className="modal-btn ghost" href={`/anime/${linkedAnimeSeason.malId}`}>
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
        {/* Left Column: Chapter & Volume Tracker */}
        <div className="detail-card detail-manga-tracker-card">
          <div className="detail-section">
            <div className="detail-section-title">Manga Reading Tracker</div>

            {/* Reading Status Selector */}
            <div style={{ marginBottom: 20 }}>
              <span className="field-label">Reading Status</span>
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
            <div className="manga-tracker-steppers">
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

            {/* Interactive Volume Grid */}
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
                  Volume Checklist ({completedVolumesList.length} read)
                </div>
                {volumes.length > 0 ? (
                  <button
                    className="btn-text-link"
                    type="button"
                    onClick={() => {
                      const allVols = volumes.map((v) => v.volume_number);
                      if (completedVolumesList.length === allVols.length) {
                        commitEntries(
                          updateEntry(entries, mangaId, "manga", { completed_volumes: [] })
                        );
                        handleUpdateProgress(chaptersRead, 0);
                      } else {
                        commitEntries(
                          updateEntry(entries, mangaId, "manga", { completed_volumes: allVols })
                        );
                        handleUpdateProgress(chaptersRead, allVols.length);
                      }
                    }}
                  >
                    {completedVolumesList.length === volumes.length
                      ? "Unmark All"
                      : "Mark All Read"}
                  </button>
                ) : null}
              </div>

              {volumes.length === 0 ? (
                <div className="detail-empty">No volume breakdown available.</div>
              ) : (
                <div className="volume-grid custom-scroll">
                  {volumes.map((vol) => {
                    const isRead = completedVolumesList.includes(vol.volume_number);
                    return (
                      <button
                        key={vol.mal_id}
                        type="button"
                        className={`volume-tile ${isRead ? "read" : ""}`}
                        onClick={() => toggleVolume(vol.volume_number)}
                        title={`Click to mark ${vol.title} as ${isRead ? "unread" : "read"}`}
                      >
                        <span className="vol-number">VOL.{String(vol.volume_number).padStart(2, "0")}</span>
                        <span className="vol-check">{isRead ? "✓" : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Overview, Cast & Franchise Navigation */}
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
            {franchiseGraph &&
            (franchiseGraph.seasons.length > 0 || franchiseGraph.adaptations.length > 1) ? (
              <button
                className={`detail-tab ${activeInfoTab === "franchise" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveInfoTab("franchise")}
              >
                Franchise ({franchiseGraph.seasons.length + franchiseGraph.adaptations.length})
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
                <div className="detail-section-title">Characters</div>
                {characters.length === 0 ? (
                  <div className="detail-empty">No character data available.</div>
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
            ) : (
              <div className="detail-section">
                <div className="detail-section-title">Franchise Media & Adaptations</div>

                {/* Linked Anime Seasons */}
                {franchiseGraph && franchiseGraph.seasons.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <div className="franchise-group-title">Anime Seasons</div>
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
                          <Link className="franchise-node-action" href={`/anime/${season.malId}`}>
                            Track Anime →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Other Adaptations (Spinoffs/Novels) */}
                {franchiseGraph && franchiseGraph.adaptations.length > 1 ? (
                  <div>
                    <div className="franchise-group-title">Related Manga & Light Novels</div>
                    <div className="franchise-nodes-list">
                      {franchiseGraph.adaptations
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
                            <Link className="franchise-node-action" href={`/manga/${otherManga.malId}`}>
                              Switch →
                            </Link>
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
