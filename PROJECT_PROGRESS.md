# Okami Project Progress Report
Date: 2026-11-06

## Scope Snapshot
- Complete Anime & Manga tracker with four primary views (Library, Explore, My List, Profile) and dedicated media trackers.
- **Top-Notch Explore & Real-Time Discovery Engine**: Blazing-fast (<300ms) catalog exploration with multi-provider architecture (AniList GraphQL + Jikan v4 fallback). Instant live search, dynamic Anime/Manga mode switching, quick search tags, multi-genre selection, format/status/season filters, and load-more pagination.
- **Unified Cinematic Explore & Discovery Design**:
  - Matched Okami's primary dark cinematic aesthetic (`--surface-1`, `--surface-2`, `--border`, `--border-hi`, `--accent` `#E8194B`, Bebas Neue headings, Nunito text, soft 4px border radius).
  - Maintained the requested structured layout:
    - Full-width custom interactive spotlight slider with pip selectors, auto-rotation, and pause on hover.
    - Multi-Row × Multi-Column category grids (2 rows × 5 columns) with custom batch sliders (`[ ◀ Prev ]` `Page 01 / 02` `[ Next ▶ ]`).
    - Precision 3:4.2 aspect ratio poster cards matching Library cards with format chips, gold score badges, and hover actions.
- **Structured Thematic Categories**: Comprehensive categorization across Anime (Current Airing, All-Time Titans & Masterpieces, Feature Films & Cinematic Specials, High-Octane Action & Shonen, Psychological & Dark Seinen) and Manga (Top-Tier Manga Masterpieces, Light Novels & Web Serials, Action & Dark Fantasy Manga, Romance & Character-Driven Manga).
- **Library Cover Card Collision Fix**:
  - Eliminated the overlap where `.status-badge` (`Watching`, `Completed`, `Plan to Watch`) overlapped and blocked clickable action buttons (`+1 Ep`, `Update`, `Info`) inside `.card-actions`.
  - Added smooth hover transition where `.status-badge` fades out on hover and `.card-actions` receives `z-index: 10`, `flex: 1` button distribution, and clean touch targets.
  - Added `max-width: calc(100% - 64px)` with ellipsis truncation to `.franchise-pointer-badge` to prevent top-header collisions with `.score-badge`.
- **Unified Franchise Tracking**: Group all seasons, sequels, movies, OVAs, and linked manga adaptations under single franchise entries.
- **Complete Manga Tracker**: Dedicated routes (`/manga/[id]`, `/manga/[id]/info`) with interactive volume shelf grid, chapter/volume steppers (-1, +1, +5, direct inputs), and adaptation switcher.
- **Multi-Season Anime Tracker**: Dedicated routes (`/anime/[id]`, `/anime/[id]/info`) with dual progress bars (Franchise + Season), season tab switching, episode tracker with filler/recap badges, "Watch up to here", "Complete Season", and trailer modal.
- **Robust Storage Engine**: Reactive localStorage store supporting unified `okami_franchises` models with automatic non-destructive migration from legacy `okami_entries`, cross-tab synchronization, and versioned JSON export/import.
- **Resilient Multi-Provider Proxy Routes (`app/api/jikan/*`)**: Dual-provider fallback with rapid timeouts preventing connection hangs, automated failover between AniList GraphQL and Jikan v4, LRU/TTL caching, and Next.js Cache-Control headers.
- **Cinematic Dark UI**: Strict design system and typography (`Bebas Neue`, `IBM Plex Mono`, `Nunito`) with glassmorphism, accent badges, responsive navigation, and zero mock/dummy placeholders.
- **Mihon-Inspired Architectural Optimizations (`TrackManager`, Smart Caching, Tri-State Filters, Ported Importers)**:
  - **Relational TrackManager (`app/lib/storage.ts`)**:
    - Complete relational separation of parent `UnifiedFranchiseEntry` records from child `SeasonTrack` and `MangaTrack` records (`okami_season_tracks`, `okami_manga_tracks`).
    - Mihon auto-state transitions: progression from `0 -> 1` automatically moves status from `PLAN_TO_WATCH`/`PLAN_TO_READ` to `WATCHING`/`READING` and stamps `startedAt`; reaching total episodes/chapters marks entry as `COMPLETED`, stamps `completedAt`, and automatically advances `activeSeasonMalId` to the next chronological canon season.
    - Append-only activity log (`okami_history`) tracking all user increments with relative timestamps, powering the new "Recently Watched / Read" interactive activity strip.
    - Profile & Library stats summary metrics (Total Episodes, Total Chapters, Mean Score, Days Watched).
  - **Smart Metadata Refresh & Rate-Limit Interceptor (`app/lib/jikan.ts` & `app/api/jikan/*`)**:
    - Token-Bucket rate limiter (3 requests/sec capacity) with exponential backoff on HTTP 429 rate limits.
    - Mihon Smart Refresh gates: Finished airing titles (`"Finished Airing"` / `"Finished"`) with cached episodes/volumes bypass redundant network requests.
    - Ported `parseMediaNumber()` (from Mihon's `ChapterRecognition`) and `formatMediaNumberDisplay()` supporting `.5` decimal specials and interactive Season-Relative (`S2 Ep 1`) vs Absolute (`Ep 26`) numbering toggle.
  - **Library Tri-State Filtering, Custom Categories & Multi-Platform Backup**:
    - Mihon-style Tri-State chips (`Neutral` ⚪ -> `Include` 🟢 -> `Exclude` 🔴) for Status, Media Type, Airing Status, and Unwatched/Unread Badge Count.
    - Sorting by Last Updated, Title A–Z, Score, Total Progress, Unwatched / Unread, Date Added, and Year.
    - Unwatched Episodes / Unread Chapters badge pills on franchise cards (`totalAvailable - userProgress`).
    - Custom Category management (add, delete, assign franchise to custom categories).
    - Versioned JSON Backup Export/Import (v3 schema) plus native MyAnimeList (XML/JSON) and AniList (JSON) backup imports.
- **Unified Explore Section Header**:
  - Matched Explore's header styling to Library, My List, and Profile (`page-title-kanji` `探索`, `page-title-slash` `/`, `page-title` `EXPLORE`, and `page-sub`).
- **Complete & Absolute My List Table & Tracker Integration**:
  - Full relational binding with `buildUnifiedLibraryItems(franchises, entries)` ensuring total synchronization between franchise trees and individual tracked entries.
  - Interactive inline progress stepper with `[-]` `x / y` `[+]` controls, direct numeric input, and Mihon auto-state transitions (`0 -> 1` marks Watching/Reading, max marks Completed, logs history, advances season).
  - Interactive user score dropdown (1–10 / Unrated) with instant bidirectional persistence.
  - Interactive status dropdown with real-time style transitions.
  - Live search bar by title, genre, or release year with clear button.
  - Type segmented chips (`All Media`, `Anime Only`, `Manga Only`).
  - Status tabs (`All`, `Watching / Reading`, `Completed`, `On Hold`, `Dropped`, `Plan to Watch / Read`, `★ Favourites`) with live item counts.
  - Clickable table column headers with ascending/descending indicators (`#`, `Title`, `Format`, `Score`, `MAL`, `Status`, `Progress`, `Added`).
  - Row action controls: Favourite toggle (`★`/`☆`), Direct Tracker link (`↗`), Full Edit modal (`✎`), and Delete confirmation (`✕`).
  - Interactive Score Distribution (1–10) and Genre Breakdown donut charts with color-coded legends.

---

## Verification & Status
- `npx tsc --noEmit`: **0 errors** (Clean TypeScript typecheck across all files).
- `npm run build`: **0 errors** (All 13 static and dynamic routes compiled with zero errors).
- `git status`: Pushed to `origin/main` (`75848c4`).
