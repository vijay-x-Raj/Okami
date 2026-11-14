"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { OkamiMedia } from "../lib/jikan";
import type { OkamiEntry, OkamiStatus, FranchiseItemOption } from "../lib/storage";
import { formatScore, statusOptions, scoreLabels } from "../lib/libraryUtils";

export function AddEntryModal({
  state,
  onClose,
  onSave,
}: {
  state: { media: OkamiMedia; entry?: OkamiEntry } | null;
  onClose: () => void;
  onSave: (data: {
    status: OkamiStatus;
    userScore: number | null;
    notes: string;
    progress: number;
    completedSeasons: number[];
    completedVolumes: number[];
    selectedFranchiseItems?: FranchiseItemOption[];
  }) => void;
}) {
  const media = state?.media;
  const entry = state?.entry;

  const total = media?.total && media.total > 0 ? media.total : null;
  const isManga = media?.type === "manga";
  const unit = isManga ? "Chapters" : "Episodes";

  const [progress, setProgress] = useState<number>(() => Math.max(0, entry?.progress ?? 0));
  const [status, setStatus] = useState<OkamiStatus>(() => entry?.status ?? "plan_to_watch");
  const [userScore, setUserScore] = useState<number | null>(() => entry?.user_score ?? null);
  const [notes, setNotes] = useState(() => entry?.notes ?? "");
  const [inputVal, setInputVal] = useState<string>(() => String(entry?.progress ?? 0));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!media) return null;

  const percent =
    total !== null && total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;

  const remaining = total !== null ? Math.max(0, total - progress) : null;

  const handleProgressChange = (newVal: number) => {
    const clamped = Math.max(0, total !== null ? Math.min(newVal, total) : newVal);
    setProgress(clamped);
    setInputVal(String(clamped));

    if (clamped > 0 && status === "plan_to_watch") {
      setStatus("watching");
    }
    if (total !== null && clamped >= total) {
      setStatus("completed");
    }
  };

  const handleDirectInputChange = (str: string) => {
    setInputVal(str);
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= 0) {
      const clamped = total !== null ? Math.min(num, total) : num;
      setProgress(clamped);
      if (clamped > 0 && status === "plan_to_watch") {
        setStatus("watching");
      }
      if (total !== null && clamped >= total) {
        setStatus("completed");
      }
    }
  };

  return (
    <div className="update-drawer-overlay" onClick={onClose}>
      <aside
        className={`update-drawer-panel ${isManga ? "theme-manga" : "theme-anime"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="update-drawer-header">
          <div>
            <div className="update-drawer-eyebrow">
              {isManga ? "// OKAMI MANGA TRACKER" : "// OKAMI ANIME TRACKER"}
            </div>
            <h2 className="update-drawer-title">
              {entry
                ? isManga
                  ? "UPDATE MANGA ENTRY"
                  : "UPDATE ANIME ENTRY"
                : isManga
                  ? "ADD MANGA TO LIBRARY"
                  : "ADD ANIME TO LIBRARY"}
            </h2>
          </div>
          <button
            className="update-drawer-close"
            type="button"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Media Summary Card */}
        <div className="update-drawer-media-card">
          <img
            src={media.cover}
            alt={media.title}
            className="update-drawer-media-cover"
          />
          <div className="update-drawer-media-info">
            <div className="update-drawer-media-title" title={media.title}>
              {media.title}
            </div>
            <div className="update-drawer-badges">
              <span className={`update-media-badge ${media.type}`}>
                {media.type}
              </span>
              <span className="update-media-meta-tag">{media.format}</span>
              {media.year ? (
                <span className="update-media-meta-tag">• {media.year}</span>
              ) : null}
              <span className="update-media-meta-tag">
                • {total ? `${total} ${unit}` : "Ongoing"}
              </span>
            </div>
            <div className="update-drawer-scores-row">
              <span className="update-mal-score">
                MAL {formatScore(media.official_score)}
              </span>
              <span className="update-library-status-badge">
                {entry ? `In Library: ${entry.status.replace("_", " ")}` : "Not in Library"}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="update-drawer-body custom-scroll">
          {/* Progress Tracker Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">
                {isManga ? "01 / CHAPTER TRACKER" : "01 / EPISODE TRACKER"}
              </span>
              <span className={`update-section-badge ${percent === 100 ? "highlight" : ""}`}>
                {total !== null
                  ? `${percent}% COMPLETED`
                  : isManga
                    ? "ONGOING RELEASE"
                    : "ONGOING BROADCAST"}
              </span>
            </div>

            <div className="update-progress-display">
              <div className="update-progress-numbers">
                <span className="update-progress-num-big">{progress}</span>
                <span className="update-progress-total-sub">
                  / {total !== null ? total : "∞"} {unit.toLowerCase()}
                </span>
              </div>
              <div className="update-progress-percent">
                {total !== null ? (
                  remaining === 0 ? (
                    <span style={{ color: "var(--teal)" }}>All Caught Up</span>
                  ) : (
                    <span>
                      {remaining} {unit.toLowerCase()} remaining
                    </span>
                  )
                ) : (
                  <span style={{ color: "var(--gold)" }}>
                    {isManga ? "Ongoing Publication" : "Ongoing Broadcast"}
                  </span>
                )}
              </div>
            </div>

            {total !== null && total > 0 && (
              <div className="update-progress-meter-track">
                <div
                  className="update-progress-meter-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}

            <div className="update-steppers-row">
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress - 10)}
                disabled={progress <= 0}
                title="Back 10"
              >
                -10
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress - 5)}
                disabled={progress <= 0}
                title="Back 5"
              >
                -5
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress - 1)}
                disabled={progress <= 0}
                title="Back 1"
              >
                -1
              </button>

              <div
                className="update-direct-input-wrap"
                title={`Directly enter ${isManga ? "chapter" : "episode"} number`}
              >
                <input
                  type="number"
                  className="update-direct-input"
                  min={0}
                  max={total ?? 99999}
                  value={inputVal}
                  onChange={(e) => handleDirectInputChange(e.target.value)}
                  onBlur={() => setInputVal(String(progress))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress + 1)}
                disabled={total !== null && progress >= total}
                title="Forward 1"
              >
                +1
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress + 5)}
                disabled={total !== null && progress >= total}
                title="Forward 5"
              >
                +5
              </button>
              <button
                type="button"
                className="update-stepper-btn"
                onClick={() => handleProgressChange(progress + 10)}
                disabled={total !== null && progress >= total}
                title="Forward 10"
              >
                +10
              </button>
              {total !== null && (
                <button
                  type="button"
                  className="update-stepper-btn max-btn"
                  onClick={() => handleProgressChange(total)}
                  disabled={progress >= total}
                  title="Mark as completed"
                >
                  MAX
                </button>
              )}
            </div>

            <div className="update-quick-step-row">
              <button
                type="button"
                className="update-quick-step-btn"
                onClick={() => handleProgressChange(progress + 1)}
                disabled={total !== null && progress >= total}
              >
                {isManga ? "+1 Chapter Read" : "+1 Episode Watched"}
              </button>
            </div>
          </div>

          {/* Tracking Status Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">02 / TRACKING STATUS</span>
              <span className="update-section-badge">
                {status.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <div className="update-status-grid">
              {statusOptions.map((opt) => {
                const isWatchingOpt = opt.value === "watching";
                const isPlanOpt = opt.value === "plan_to_watch";
                const label = isManga
                  ? isWatchingOpt
                    ? "Reading"
                    : isPlanOpt
                      ? "Plan to Read"
                      : opt.label
                  : isWatchingOpt
                    ? "Watching"
                    : isPlanOpt
                      ? "Plan to Watch"
                      : opt.label;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`update-status-btn ${status === opt.value ? "active" : ""}`}
                    onClick={() => setStatus(opt.value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rating Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">03 / PERSONAL RATING</span>
              {userScore ? (
                <span className="update-score-header-val">
                  {userScore} / 10 — {scoreLabels[userScore]}
                </span>
              ) : (
                <span className="update-section-badge">UNRATED</span>
              )}
            </div>
            <div className="update-score-row">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`update-score-pill ${userScore === num ? "active" : ""}`}
                  onClick={() => setUserScore(userScore === num ? null : num)}
                  title={`${num} - ${scoreLabels[num]}`}
                >
                  {num}
                </button>
              ))}
            </div>
            {userScore !== null && (
              <button
                type="button"
                className="update-score-clear"
                onClick={() => setUserScore(null)}
              >
                Clear Rating
              </button>
            )}
          </div>

          {/* Notes Section */}
          <div className="update-section">
            <div className="update-section-head">
              <span className="update-section-label">04 / PRIVATE MEMO</span>
              <span className="update-section-badge">{notes.length} CHARS</span>
            </div>
            <textarea
              className="update-notes-textarea custom-scroll"
              rows={3}
              placeholder="Add impressions, bookmarks, or personal reflections..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="update-drawer-footer">
          <Link
            className="modal-btn ghost"
            href={media.type === "anime" ? `/anime/${media.id}` : `/manga/${media.id}`}
            title="Open Tracker Details"
          >
            Tracker →
          </Link>
          <div className="update-drawer-footer-right">
            <button
              className="modal-btn ghost"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="modal-btn primary"
              type="button"
              onClick={() => {
                onSave({
                  status,
                  userScore,
                  notes,
                  progress,
                  completedSeasons: [],
                  completedVolumes: [],
                });
              }}
            >
              {entry ? "Save Changes" : "Add to Library"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
