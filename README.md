# ŌKAMI (狼)

> **A high-performance, cinematic anime and manga franchise tracking system built with Next.js 16, TypeScript, and Mihon-inspired relational architecture.**

---

## Overview

**Ōkami** is a modern, distraction-free media tracking platform designed for discerning anime and manga enthusiasts. Built around a low-glow, high-contrast cinematic aesthetic, Ōkami eliminates the clutter of traditional trackers in favor of clean typography, instantaneous client-side interactions, and intelligent multi-season franchise binding.

Whether tracking sprawling multi-decade franchises like *Monogatari* or *Fate*, exploring upcoming seasonal anime, or managing an extensive reading backlog, Ōkami delivers a unified, responsive experience across desktop and mobile devices.

---

## Key Features

### 1. Mihon-Inspired Franchise Relational Binding
- **Unified Franchise Architecture (`TrackManager`)**: Automatically clusters prequels, sequels, side stories, movies, and manga adaptations under a single franchise identity while maintaining granular per-season track records.
- **Automated Lifecycle Transitions**:
  - Advancing progress from `0 -> 1` automatically shifts status from *Plan to Watch / Read* to *Watching / Reading* and timestamps the start date.
  - Completing the active season automatically marks it *Completed*, stamps the completion date, and chronologically advances `activeSeasonMalId` to the next chronological release.
- **Append-Only Activity Log**: Records every progress increment into an immutable audit trail (`okami_history`) powering real-time statistics and a "Recently Watched / Read" activity feed.
- **Analytics & Statistics**: Live dashboard displaying score distributions (1–10), genre breakdown donuts, total episodes/chapters completed, mean user rating, and total consumption metrics.

### 2. Smart Metadata & Token-Bucket Rate Limiting
- **Token-Bucket Rate Limiter**: Transparent client/server proxy layer enforcing strict rate limits (max 3 req/sec) with automated exponential backoff on HTTP 429 responses.
- **Smart Refresh Gates**: Caches completed anime (`"Finished Airing"`) and manga (`"Finished"`), bypassing redundant network queries on subsequent visits.
- **Intelligent Media Recognition**: Ported from Mihon's `ChapterRecognition` engine to normalize episode and chapter numbering, with full support for decimal/special releases (`.5` episodes) and dynamic toggling between Season-Relative (`S2 Ep 1`) and Absolute (`Ep 26`) numbering.

### 3. Precision Library & List Management
- **Tri-State Filtering**: Advanced multi-attribute filtering supporting `Include`, `Exclude`, and `Neutral` states across media types (`Anime`, `Manga`, `Films`), statuses, and unwatched/unread status.
- **Inline Popover Score Picker**: Instant 1–10 rating selector with standard descriptive labels (`Masterpiece`, `Great`, `Good`, etc.) positioned via viewport-aware fixed overlays without table layout shift.
- **Interactive Progress Stepper**: Quick-increment controls (`+1`, `-1`) and a slide-out update drawer featuring continuous gradient sliders, precise chapter/episode input, and status switches.
- **Custom Categories & Tags**: Create custom organizational shelves and assign entries seamlessly.
- **Data Portability**: Full JSON backup export and restore, alongside native import parsers for MyAnimeList (XML/JSON) and AniList (JSON).

### 4. Cinematic Dark-Mode Design System
- **Strict Color Tokens**: Low-glow surface palette (`--surface-1` through `--surface-4`, `--border`, `--border-hi`) accented with crimson red (`#E8194B`), champagne gold (`#C4A84F`), and deep sea teal (`#3DB89C`).
- **Curated Typography**: Bebas Neue for display headings, Nunito for UI body copy, and IBM Plex Mono for numeric counters and metadata tags.
- **Zero-Shift Grid & Tables**: Hardened CSS layout rules preventing horizontal table expansion and vertical layout jumps during state modifications.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16 (Turbopack)](https://nextjs.org/) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode) |
| **Styling** | Vanilla CSS Variables, Modular Design Tokens, Zero Heavy UI Framework Overhead |
| **Data Sources** | [Jikan REST API v4](https://jikan.moe/) & [AniList GraphQL API](https://anilist.gitbook.io/anilist-apiv2-docs/) |
| **Client Storage** | LocalStorage with Schema Versioning & Automated Legacy Migrations |

---

## Project Structure

```
Okami/
├── app/
│   ├── anime/
│   │   └── [id]/
│   │       ├── page.tsx          # Anime episode tracker & season graph view
│   │       └── info/page.tsx     # Anime detailed metadata & character roster
│   ├── manga/
│   │   └── [id]/
│   │       ├── page.tsx          # Manga volume & chapter tracker
│   │       └── info/page.tsx     # Manga metadata, authors & related works
│   ├── api/
│   │   └── jikan/
│   │       ├── characters/       # Character casting endpoint
│   │       ├── detail/           # Metadata proxy
│   │       ├── episodes/         # Episode list with pagination cache
│   │       ├── franchise/        # Related media graph resolver
│   │       ├── related/          # Direct adaptations & sequels
│   │       ├── search/           # Multi-filter search proxy
│   │       ├── season/           # Seasonal anime query
│   │       ├── top/              # Top-ranked rankings proxy
│   │       └── volumes/          # Manga volume release scraper
│   ├── lib/
│   │   ├── anilist.ts            # AniList GraphQL query client & fallback mapper
│   │   ├── api.ts                # Client API fetch wrappers with error handling
│   │   ├── jikan.ts              # Jikan types, rate-limiting & chapter recognition
│   │   └── storage.ts            # TrackManager, relational bindings & migration logic
│   ├── globals.css               # Design system, theme variables & animations
│   ├── layout.tsx                # Root layout & font loaders
│   └── page.tsx                  # Main single-page application (Library, Explore, My List)
├── public/                       # Static public assets
├── .gitignore                    # Git ignore configurations
├── eslint.config.mjs             # ESLint configuration
├── next.config.ts                # Next.js configuration
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript compiler options
```

---

## Getting Started

### Prerequisites
- **Node.js**: `v18.18.0` or higher (Node.js `v20+` recommended)
- **Package Manager**: `npm` (v9+) or `pnpm` / `yarn`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/vijay-x-Raj/Okami.git
   cd Okami
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## Available Scripts

- `npm run dev`: Starts the Next.js development server with Turbopack enabled.
- `npm run build`: Generates an optimized production build and validates all static/dynamic routes.
- `npm run start`: Runs the compiled Next.js production server.
- `npm run lint`: Executes ESLint across all TypeScript and React source files.
- `npx tsc --noEmit`: Runs the TypeScript compiler to ensure 100% type safety.

---

## Data Storage & Backups

Ōkami is designed to work out-of-the-box without requiring an external database setup. All library data, custom categories, and viewing histories are stored in your browser's `localStorage` under isolated keys:

- `okami_franchises`: Relational multi-track franchise library records.
- `okami_entries`: Standalone media tracking entries.
- `okami_history`: Chronological append-only activity log.
- `okami_categories`: User-defined organizational shelves.

### Backup & Restore
You can safely export your entire library at any time by heading to **Profile / Settings -> Export Library (JSON)**. This produces a timestamped JSON backup file that can be restored on any device or browser with zero data loss.

---

## License

This project is licensed under the [MIT License](LICENSE).
