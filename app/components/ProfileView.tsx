"use client";

import Link from "next/link";
import React from "react";
import type { OkamiEntry } from "@/app/lib/storage";

function entryKey(entry: OkamiEntry) {
  return `${entry.type}-${entry.id}`;
}

export function ProfileView({
  profileStats,
  favourites,
  onExport,
  onImport,
  onImportMAL,
  onImportAniList,
  onClear,
}: {
  profileStats: Array<{ label: string; value: string }>;
  favourites: OkamiEntry[];
  onExport: () => void;
  onImport: () => void;
  onImportMAL?: () => void;
  onImportAniList?: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="page-header">
        <div className="page-title-row">
          <span className="page-title-kanji">記録</span>
          <span className="page-title-slash">/</span>
          <span className="page-title">PROFILE</span>
        </div>
        <div className="page-sub">Analytics, backups, and vault controls</div>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-avatar">ŌK</div>
            <div>
              <div className="profile-name">Okami Master</div>
              <div className="profile-join">Tracking Vault • Active</div>
            </div>
          </div>
          <div className="profile-stats">
            {profileStats.map((stat) => (
              <div className="profile-stat" key={stat.label}>
                <span className="profile-stat-value">{stat.value}</span>
                <span className="profile-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="section-header">
            <span className="section-title">Favourite Titles</span>
          </div>
          <div className="favourite-row">
            {favourites.length === 0 ? (
              <div className="empty-inline">No favourites marked yet. Star titles from Library or My List.</div>
            ) : (
              favourites.slice(0, 6).map((entry) => (
                <div className="favourite-card" key={entryKey(entry)}>
                  <Link href={entry.type === "anime" ? `/anime/${entry.id}` : `/manga/${entry.id}`}>
                    <img className="favourite-cover" src={entry.cover} alt={entry.title} />
                  </Link>
                  <span className="favourite-title">{entry.title}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="profile-card settings-card">
          <div className="section-header">
            <span className="section-title">Vault Data Management (Mihon Port)</span>
          </div>
          <div className="settings-list">
            <button className="settings-btn" type="button" onClick={onExport}>
              Export Vault Backup (JSON v3)
            </button>
            <button className="settings-btn" type="button" onClick={onImport}>
              Import Vault Backup (JSON)
            </button>
            {onImportMAL && (
              <button className="settings-btn" type="button" onClick={onImportMAL}>
                Import from MyAnimeList (XML / JSON)
              </button>
            )}
            {onImportAniList && (
              <button className="settings-btn" type="button" onClick={onImportAniList}>
                Import from AniList (JSON)
              </button>
            )}
            <button className="settings-btn danger" type="button" onClick={onClear}>
              Clear All Vault Data
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
