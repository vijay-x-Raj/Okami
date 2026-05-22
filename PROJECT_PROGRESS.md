# Okami Project Progress Report
Date: 2026-05-20

## Scope Snapshot
- Build an anime and manga tracker with four primary views (Library, Explore, My List, Profile).
- Persist user data in localStorage using the okami_entries data model.
- Use Jikan API v4 for metadata and cover art (no streaming features).
- Deliver a cinematic UI with a defined design system and typography.
- Reference designs and requirements in okami_build_prompt.md and okami_library.html.

## Current Architecture
- Framework: Next.js 16.2.6 App Router with TypeScript.
- UI: Single client-rendered page in app/page.tsx with view switching.
- API: Route handlers under app/api/jikan for proxying Jikan requests.
- Data: localStorage helpers in app/lib/storage.ts.
- Normalization: Jikan response shaping and image selection in app/lib/jikan.ts.
- Styling: Global design system and layout rules in app/globals.css.

## Feature Status By View
### Library
- Grid and list views with filters (type, genre, status) and sorting (date added, score, title, year).
- Entry cards with score and status badges; list rows with progress and dates.
- Empty states for no entries and no matches.

### Explore
- Debounced search (600ms) against Jikan via /api/jikan/search.
- Featured hero using seasonal data, plus top anime and manga strips.
- Results grid with add-to-library and in-library states.
- Static filter pills (genre, season, studio, type) are visual only.

### My List
- Stat strip (total, completed, watching, mean score).
- Status tabs and dense list table.
- Score distribution chart driven by user scores.
- Donut chart is currently static (visual only).

### Profile
- Stats summary derived from entries.
- Settings actions are present but not implemented (export/import/clear).
- Favorite titles are currently static text blocks.

### Modals and Detail Panel
- Add/Update entry modal with status, progress, score, and notes.
- Slide-in detail panel with cover, metadata, and synopsis fetch on demand.

## Data Model (localStorage)
- Key: okami_entries
- Model: OkamiEntry with fields for id, type, title, cover, year, format, genres,
  official_score, user_score, status, progress, total, date_added, notes, is_favourite.

## API Integration (Jikan)
- Endpoints:
  - /api/jikan/search (no-store)
  - /api/jikan/top (revalidate: 3600)
  - /api/jikan/season (revalidate: 3600)
  - /api/jikan/detail (revalidate: 3600)
- Normalization includes title resolution, format mapping, and cover selection (WebP large, JPG fallback).

## UI System and UX Notes
- CSS variables define palette, spacing, and typography.
- Sidebar + topbar layout with kanji watermarks per view.
- Card hover, skeleton loading, modal animation, and responsive breakpoints implemented.

## Completed Milestones
- Next.js project scaffolded with App Router + TypeScript.
- Library, Explore, My List, Profile views implemented in a single-page shell.
- Jikan proxy API routes and client fetch helpers implemented.
- localStorage data model and add/update modal flow implemented.
- Detail panel fetches and displays additional metadata.
- Design system and layout rules aligned to the original prompt.

## In Progress / Gaps
- Explore filter pills do not affect results yet.
- My List overflow menu is a placeholder.
- Profile settings actions (export/import/clear) are not wired.
- Donut chart is static; needs real data mapping.
- Detail panel does not include tabs (episodes/volumes/related).

## Risks and Follow-Ups
- Jikan rate limits: no client-side throttling beyond debounce.
- No formal tests or automated QA yet.
- localStorage schema changes are not versioned.

## Files of Interest
- app/page.tsx
- app/globals.css
- app/lib/api.ts
- app/lib/jikan.ts
- app/lib/storage.ts
- app/api/jikan/*
- okami_build_prompt.md
- okami_library.html
