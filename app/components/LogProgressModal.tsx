"use client";

import React, { useMemo, useState } from "react";
import { updateEntry, type OkamiEntry } from "@/app/lib/storage";

function entryKey(entry: OkamiEntry) {
  return `${entry.type}-${entry.id}`;
}

export function LogProgressModal({
  entries,
  onCommit,
  onClose,
}: {
  entries: OkamiEntry[];
  onCommit: (next: OkamiEntry[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OkamiEntry | null>(null);
  const [progress, setProgress] = useState("");

  const filtered = useMemo(() => {
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(query.toLowerCase()) &&
        (e.status === "watching" || e.status === "plan_to_watch")
    );
  }, [entries, query]);

  const handleSelect = (entry: OkamiEntry) => {
    setSelected(entry);
    setProgress(String(entry.progress + 1));
  };

  const handleSave = () => {
    if (!selected) return;
    const val = Number(progress);
    if (!Number.isFinite(val) || val < 0) return;

    const maxTotal = selected.total && selected.total > 0 ? selected.total : Infinity;
    const clamped = Math.min(val, maxTotal);
    const isCompleted = selected.total && clamped >= selected.total;

    onCommit(
      updateEntry(entries, selected.id, selected.type, {
        progress: clamped,
        status: isCompleted ? "completed" : "watching",
      })
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Log Reading / Watching Progress</span>
          <button className="modal-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <input
          className="search-input"
          style={{ width: "100%", marginBottom: 12 }}
          placeholder="Filter your active titles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="log-list custom-scroll" style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 ? (
            <div className="detail-empty">No active titles found.</div>
          ) : (
            filtered.map((item) => (
              <div
                key={entryKey(item)}
                onClick={() => handleSelect(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 8,
                  borderRadius: 4,
                  background: selected?.id === item.id && selected.type === item.type ? "var(--surface-3)" : "var(--surface-2)",
                  border: `1px solid ${selected?.id === item.id && selected.type === item.type ? "var(--accent)" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                <img src={item.cover} alt={item.title} style={{ width: 36, height: 48, objectFit: "cover", borderRadius: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {item.type === "manga" ? "Ch." : "Ep."} {item.progress} / {item.total ?? "?"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div style={{ marginTop: 16 }}>
            <label className="info-label" style={{ display: "block", marginBottom: 6 }}>
              New Progress ({selected.type === "manga" ? "Chapters" : "Episodes"})
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="inline-input"
                type="number"
                min={0}
                max={selected.total ?? 99999}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                style={{ width: 100, fontSize: 14 }}
              />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                / {selected.total ?? "ongoing"}
              </span>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="modal-btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            type="button"
            onClick={handleSave}
            disabled={!selected}
          >
            Save Progress
          </button>
        </div>
      </div>
    </div>
  );
}

