"use client";

import { useState } from "react";
import Link from "next/link";
import type { OkamiMedia } from "../lib/jikan";
import {
  type OkamiStatus,
  type UnifiedFranchiseEntry,
  updateFranchiseTitle,
  updateContainedSeasonStatus,
} from "../lib/storage";
import type { UnifiedLibraryItem } from "../lib/libraryUtils";

export function FolderModal({
  item,
  franchises,
  onCommitFranchises,
  onClose,
  onOpenTracker,
  onDetail,
}: {
  item: UnifiedLibraryItem;
  franchises: Record<string, UnifiedFranchiseEntry>;
  onCommitFranchises: (franchises: Record<string, UnifiedFranchiseEntry>) => void;
  onClose: () => void;
  onOpenTracker: (item: UnifiedLibraryItem) => void;
  onDetail: (media: OkamiMedia) => void;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(item.title);

  const handleSaveTitle = () => {
    if (!titleInput.trim()) return;
    const next = updateFranchiseTitle(franchises, item.id, titleInput.trim());
    onCommitFranchises(next);
    setIsEditingTitle(false);
  };

  const handleToggleStatus = (malId: number, currentStatus: OkamiStatus) => {
    const nextStatus: OkamiStatus =
      currentStatus === "completed"
        ? "watching"
        : currentStatus === "watching"
        ? "plan_to_watch"
        : "completed";
    const next = updateContainedSeasonStatus(franchises, item.id, malId, nextStatus);
    onCommitFranchises(next);
  };

  const handleMarkAllCompleted = () => {
    let next = { ...franchises };
    for (const c of item.containedItems) {
      next = updateContainedSeasonStatus(next, item.id, c.id, "completed");
    }
    onCommitFranchises(next);
  };

  return (
    <div className="folder-modal-backdrop" onClick={onClose}>
      <div className="folder-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="folder-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="folder-modal-eyebrow">
              COLLECTION FOLDER • {item.containedItems.length} RELEASES
            </div>
            {isEditingTitle ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <input
                  className="search-input"
                  style={{ fontSize: 16, fontWeight: 700, padding: "4px 10px", width: "65%" }}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  autoFocus
                />
                <button type="button" className="folder-action-btn primary" onClick={handleSaveTitle}>
                  Save
                </button>
                <button type="button" className="folder-action-btn" onClick={() => setIsEditingTitle(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <h2 className="folder-modal-title" style={{ margin: 0 }}>
                  {item.title}
                </h2>
                <button
                  type="button"
                  className="folder-action-btn"
                  style={{ fontSize: 10, padding: "2px 8px" }}
                  onClick={() => setIsEditingTitle(true)}
                  title="Rename this collection folder"
                >
                  Rename
                </button>
              </div>
            )}
            <div className="folder-modal-stats">
              <span>
                Progress:{" "}
                <strong style={{ color: "var(--text-1)" }}>
                  {item.completedCount}/{item.itemCount} Completed
                </strong>
              </span>
              <span>•</span>
              <span style={{ color: "var(--gold)", fontWeight: 700 }}>
                ★{" "}
                {item.averageOfficialScore
                  ? item.averageOfficialScore.toFixed(1)
                  : item.official_score
                  ? item.official_score.toFixed(1)
                  : "--"}{" "}
                MAL Average
              </span>
              <span>•</span>
              <span>Format: {item.format || (item.type === "manga" ? "Manga" : "TV Series")}</span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="folder-modal-body">
          <div
            style={{
            marginBottom: 12,
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-3)",
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
          >
            Contained Releases & Chronology ({item.containedItems.length})
          </div>
          <div className="folder-contained-list">
            {item.containedItems.map((c, idx) => {
              const isDone = c.status === "completed";
              return (
                <div key={c.id} className={`folder-contained-card ${isDone ? "completed" : ""}`}>
                  <img className="folder-contained-thumb" src={c.cover} alt={c.title} />
                  <div className="folder-contained-info">
                    <div className="folder-contained-header">
                      <span className={`folder-season-tag ${idx === 0 ? "s1" : ""}`}>
                        {c.seasonNumber ? `Part ${c.seasonNumber}` : `Item ${idx + 1}`}
                      </span>
                      <span className="type-chip anime" style={{ padding: "1px 6px", fontSize: 9 }}>
                        {c.format || (c.type === "manga" ? "Manga" : "TV")}
                      </span>
                      {c.year ? (
                        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
                          {c.year}
                        </span>
                      ) : null}
                    </div>
                    <div className="folder-contained-title" title={c.title}>
                      {c.title}
                    </div>
                    <div className="folder-contained-meta">
                      {c.total ? (
                        <span>
                          {c.total} {c.type === "manga" ? "Chapters" : "Episodes"}
                        </span>
                      ) : (
                        <span>Total: ?</span>
                      )}
                      <span>•</span>
                      <span style={{ color: "var(--gold)", fontWeight: 700 }}>
                        ★ {c.score && c.score > 0 ? c.score.toFixed(1) : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="folder-contained-actions">
                    <button
                      type="button"
                      className={`folder-action-btn done-btn ${isDone ? "active" : ""}`}
                      onClick={() => handleToggleStatus(c.id, c.status)}
                      title="Toggle watch status"
                    >
                      {isDone ? "✓ Done" : c.status === "watching" ? "Watching" : "Plan"}
                    </button>
                    <Link
                      href={c.type === "manga" ? `/manga/${c.id}` : `/anime/${c.id}`}
                      className="folder-action-btn primary"
                      onClick={onClose}
                    >
                      Track →
                    </Link>
                    <button
                      type="button"
                      className="folder-action-btn"
                      onClick={() => {
                        onClose();
                        onDetail({
                          id: c.id,
                          type: c.type,
                          title: c.title,
                          cover: c.cover,
                          format: c.format,
                          year: c.year || 0,
                          genres: [],
                          official_score: c.score,
                          total: c.total ?? null,
                        });
                      }}
                    >
                      Info
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="folder-modal-footer">
          <button type="button" className="folder-action-btn" onClick={handleMarkAllCompleted}>
            ✓ Mark All Completed
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="folder-action-btn primary"
              onClick={() => {
                onClose();
                onOpenTracker(item);
              }}
            >
              Open Active Tracker
            </button>
            <button type="button" className="folder-action-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
