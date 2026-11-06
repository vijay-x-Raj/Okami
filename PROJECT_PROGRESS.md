# Okami Project Progress Report
Date: 2026-11-03

## Scope Snapshot
- Complete Anime & Manga tracker with four primary views (Library, Explore, My List, Profile) and dedicated media trackers.
- **Unified Franchise Tracking**: Group all seasons, sequels, movies, OVAs, and linked manga adaptations under single franchise entries.
- **Complete Manga Tracker**: Dedicated routes (`/manga/[id]`, `/manga/[id]/info`) with interactive volume grid, chapter/volume steppers, and adaptation switcher.
- Persist user data in localStorage supporting both legacy `okami_entries` and unified `okami_franchises` models with automatic non-destructive migration.
- Jikan API v4 client proxy with rate-limiting request queue (350ms throttle), automatic retry on HTTP 429, and Next.js caching.
- Cinematic dark UI with strict design system and typography (`Bebas Neue`, `IBM Plex Mono`, `Nunito`).

---

## Architecture Overview

### Framework & Routing
- Next.js 16.2.6 App Router with TypeScript 5 & React 19.
- **Unified Franchise Resolver Route**: `app/api/jikan/franchise/route.ts` traverses `Sequel`, `Prequel`, `Parent story`, `Side story`, and `Adaptation` using BFS, sorting mainline `TV`/`ONA` seasons chronologically and computing a deterministic `rootMalId`.
- **Anime Tracker Routes**:
  - `app/anime/[id]/page.tsx`: Single-entry multi-season anime tracker with dynamic season selector, overall franchise progress rollup, one-click season completion, and switch-to-manga link.
  - `app/anime/[id]/info/page.tsx`: Anime detail & cast overview with franchise context and manga adaptation deep-link.
- **Manga Tracker Routes**:
  - `app/manga/[id]/page.tsx`: Full manga reading tracker with Chapter/Volume steppers (+1, +5, direct inputs), interactive volume checklist grid powered by `/api/jikan/volumes`, and switch-to-anime link.
  - `app/manga/[id]/info/page.tsx`: Manga metadata, volumes/chapters count, author attribution, character list, and tracker link.
- **Jikan Proxy Routes**:
  - `/api/jikan/franchise`: BFS franchise graph resolver.
  - `/api/jikan/volumes`: Manga volumes breakdown endpoint.
  - `/api/jikan/episodes`: Anime episodes list.
  - `/api/jikan/characters`: Voice actors and characters cast.
  - `/api/jikan/detail`: Media detail.
  - `/api/jikan/search`: Search with genre, season, studio, type filters.
  - `/api/jikan/season`: Seasonal anime.
  - `/api/jikan/top`: Top anime/manga.
  - `/api/jikan/related`: Related entries.

### Data & State Management (`app/lib/storage.ts`)
- **Unified Franchise Data Model**:
  - `UnifiedFranchiseEntry`: Deterministic `franchiseId` (`franchise_<rootMalId>`), root metadata, `activeSeasonMalId`, `anime.seasons`, and `manga` entries.
  - `SeasonProgress`: Season-level tracking (`episodesWatched`, `totalEpisodes`, `status: WatchStatus`).
  - `MangaProgress`: Manga-level tracking (`chaptersRead`, `totalChapters`, `volumesRead`, `totalVolumes`, `status: ReadStatus`).
- **Auto-Rollup & Auto-Advance Logic**:
  - `incrementEpisode()`: When watched episodes reach total episodes, marks season as `COMPLETED` and automatically advances `activeSeasonMalId` to the next chronological season. Sets overall status to `COMPLETED` when all seasons finish.
  - `updateMangaProgress()`, `incrementChapter()`, `incrementVolume()`: Auto-marks `COMPLETED` when chapters read reach total chapters.
- **Non-Destructive Migration**:
  - `migrateLegacyEntries()`: Migrates existing single-season `okami_entries` into unified `okami_franchises` on load without data loss.
- **Backup & Restore**:
  - Version 2 JSON Export/Import (`exportAllData()`, `importAllData()`) supporting both legacy flat arrays and full franchise graphs.

### UI & Design System (`app/globals.css`)
- Pure CSS variables, strict 4px radius, Bebas Neue headings, IBM Plex Mono data printout, Nunito descriptions.
- **Franchise Strip Banner**: Clean cinematic banner showing unified franchise title, total franchise progress, and season breakdown.
- **Season Selector Bar**: Tabbed pills for S1, S2, S3... and movies/specials with completed `✓` indicators.
- **Interactive Volume Grid**: Clickable volume tiles with reading state and mark-all functionality.
- **Quick Steppers**: Dedicated `+1 Ch` and `+1 Vol` quick action steppers with numerical inputs for long-running series.
- **Dashboard Franchise Cards**:
  - Watchlist cards display the active pointer badge (`S2 • Ep 4/12` or `Vol 5 • Ch 42`).
  - Direct `+1 Ep` / `+1 Ch` action button right on the card for instantaneous progress logging.
  - Cross-adaptation pills (`📺 Switch to Anime` / `📖 Switch to Manga`).

---

## Verification & Status
- `npx tsc --noEmit`: **0 errors** (Clean TypeScript typecheck).
- `npm run lint`: **0 errors** (ESLint pass).
- `npm run build`: **0 errors** (All 15 routes compiled and static generation successful).
