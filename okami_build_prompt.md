# ŌKAMI — Anime & Manga Tracker
## Complete Agent Build Prompt

---

## WHAT YOU ARE BUILDING

A single-page React application (one HTML file, no bundler) for tracking anime and manga.  
**This is a TRACKER, not a streaming platform.** There are no watch/play/resume buttons anywhere.  
The app has a persistent left sidebar and four views rendered in the main content area:  
**Library · Explore · My List · Profile**

All data is stored in `localStorage`. No backend required.  
Use the **Jikan REST API v4** (`https://api.jikan.moe/v4`) for all anime/manga metadata, covers, and official scores.

---

## TECH STACK

- React 18 via CDN (`https://unpkg.com/react@18/umd/react.development.js` + ReactDOM)
- Babel standalone for JSX (`https://unpkg.com/@babel/standalone/babel.min.js`)
- Google Fonts loaded via `<link>`: `Bebas+Neue`, `IBM+Plex+Mono:wght@400;500;700`, `Nunito:wght@400;500;600;700`
- No Tailwind, no CSS frameworks — pure CSS custom properties
- All in one `.html` file

---

## DESIGN SYSTEM — COPY THESE EXACTLY

### CSS Variables (define in `:root`)

```css
--base:        #0D0D12;   /* main background — cool near-black, NOT warm brown */
--surface-1:   #111118;   /* sidebar, topbar */
--surface-2:   #17171F;   /* cards, panels */
--surface-3:   #1E1E28;   /* hover, inputs, dropdowns */
--surface-4:   #25252F;   /* active states */
--border:      #252530;
--border-hi:   #32323F;
--accent:      #E8194B;   /* cerise red — used SPARINGLY: active nav, CTAs, score badges, Watching status */
--accent-dim:  rgba(232,25,75,0.15);
--accent-glow: rgba(232,25,75,0.08);
--gold:        #C4A84F;   /* user ratings, stars, favourites */
--teal:        #3DB89C;   /* Completed status */
--stone:       #4A4A5A;   /* Dropped status */
--plan-bg:     #3A3A4A;   /* Plan to Watch status */
--text-1:      #ECEAF5;   /* primary text */
--text-2:      #9A98AA;   /* secondary text */
--text-3:      #6E6C80;   /* captions, muted labels */
```

### Status badge colours
| Status | BG | Text |
|---|---|---|
| Watching | `#E8194B` | `#fff` |
| Completed | `#3DB89C` | `#003028` |
| On Hold | `#C4A84F` | `#1a1000` |
| Dropped | `#4A4A5A` | `#ECEAF5` |
| Plan to Watch | `#3A3A4A` | `#9A98AA`, 1px `#32323F` border |

### Typography
| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Page titles | Bebas Neue | 42px | 400 | letter-spacing: 4px |
| Wordmark | Bebas Neue | 32px | 400 | letter-spacing: 3px, accent colour |
| Section headings | Bebas Neue | 20–24px | 400 | letter-spacing: 2px |
| Nav items, labels, tags, scores | IBM Plex Mono | 10–12px | 500–700 | UPPERCASE, letter-spacing: 2px |
| Body, card titles, descriptions | Nunito | 13–15px | 400–700 | |
| Metadata, counts | IBM Plex Mono | 10px | 400 | |

### Shape rules
- Border radius: **4px max** on all UI elements. Cards: 4px. Buttons: 4px. Pills: 3px.
- No glassmorphism, no blur backgrounds, no gradients on surfaces.
- Status badges on cards: slightly rotated `rotate(-1deg)` on Watching only, for organic feel.
- Score badges: sharp 2px radius, IBM Plex Mono bold, positioned top-right corner of card image.

### Noise texture overlay
Apply globally as `body::after`:
```css
body::after {
  content: ''; position: fixed; inset: 0; pointer-events: none;
  opacity: 0.03; z-index: 9999;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px;
}
```

### Kanji watermarks (decorative, per page)
Each page has a large faint kanji behind the content:
- Library: `本棚` — position fixed, bottom-right, font-size 200px, opacity 0.015, font-family serif
- Explore: `探` — same treatment
- My List: `一覧` — same treatment
- Profile: `記録` — same treatment

---

## LAYOUT

```
┌──────────────────────────────────────────────────────────────────┐
│  SIDEBAR (220px)  │  TOPBAR (52px tall, full remaining width)    │
│                   ├──────────────────────────────────────────────│
│                   │                                              │
│                   │  MAIN CONTENT AREA (scrollable)              │
│                   │                                              │
└───────────────────┴──────────────────────────────────────────────┘
```

### Sidebar
- Background: `--surface-1`, right border: 1px `--border`
- Top: Wordmark "ŌKAMI" in Bebas Neue + accent, sub-label "Digital Vault" in IBM Plex Mono 9px `--text-3`
- Nav items: IBM Plex Mono 11px UPPERCASE, icon (16px thin SVG stroke) + label, `--text-3` default, `--text-1` active
- Active nav item: `--surface-3` background, 1px `--border-hi` border, **3px `--accent` left border strip** (absolute positioned, 60% height, vertically centered)
- Bottom section (pinned): 
  - `+ LOG PROGRESS` button — full width, `--accent` background, Bebas Neue or IBM Plex Mono bold, 13px UPPERCASE
  - Settings + Logout as small utility rows, `--text-3`, thin icons
- Decorative: large faint `狼` kanji watermark at bottom of sidebar, opacity 0.02

### Topbar
- Height: 52px, background `--surface-1`, bottom border 1px `--border`
- Left: context tabs (e.g. Anime / Manga) — IBM Plex Mono 11px, active tab has 2px `--accent` bottom border
- Right: search icon button (34px circle, `--surface-3`), notification icon, avatar circle (gradient + `--accent` 2px border)

---

## DATA MODEL (localStorage)

```js
// Key: "okami_entries"
// Value: JSON array of:
{
  id: number,           // Jikan mal_id
  type: "anime"|"manga",
  title: string,
  cover: string,        // image URL from Jikan
  year: number,
  format: string,       // "TV Series" | "Film" | "Manga" | "OVA" | etc.
  genres: string[],
  official_score: number,  // from Jikan, e.g. 8.7
  user_score: number|null, // 1-10, set by user
  status: "watching"|"completed"|"on_hold"|"dropped"|"plan_to_watch",
  progress: number,     // episodes watched or chapters read
  total: number|null,   // total episodes/chapters, null if ongoing
  date_added: string,   // ISO date string
  notes: string,
  is_favourite: boolean
}
```

---

## PAGE 1 — LIBRARY

**Purpose:** Your full collection. Browse, filter, sort everything you've added.

### Header
```
本棚 / LIBRARY
YOUR FULL PERSONAL COLLECTION          [grid icon] [list icon]
```
- Kanji in serif font `--text-2`, slash in IBM Plex Mono `--border-hi`, "LIBRARY" in Bebas Neue `--text-1`
- View toggle: two 36px square icon buttons (grid / list), active gets `--surface-3` + `--border-hi`

### Filter Bar
Full-width bar with `--surface-2` background, 1px `--border` border, 14px padding.

Left → right:
1. **Type pills:** ALL · ANIME · MANGA · FILMS — active pill: `--accent` fill, white text
2. Vertical divider (1px `--border`, 24px tall)
3. **Genre pills** (scrollable row): Action · Sci-Fi · Seinen · Shonen · Horror · Sports · Fantasy · Romance — active: `--accent` fill
4. Vertical divider
5. **Status pills:** Watching · Completed · On Hold · Dropped · PTW
6. Right-aligned: "SORT:" label + `<select>` styled with `--surface-3` background — options: Date Added · Score · Title A–Z · Year

### Grid View (default)
- 5-column grid, 16px gap
- **Card anatomy:**
  - Image: `aspect-ratio: 2/3`, `object-fit: cover`, 4px radius top
  - Score badge: top-right corner, `--accent` background (or `--gold` if ≥ 9.0), IBM Plex Mono bold 12px
  - Status badge: bottom-left corner of image, colour per status table, 8px IBM Plex Mono UPPERCASE
  - Hover: card lifts `translateY(-4px)`, cerise box-shadow glow, image scales 1.05x
  - Hover overlay: dark gradient from bottom, reveals two action buttons: `[Update]` `[Detail]`
  - Below image: Title (Nunito 13px bold), meta line (year • format) in IBM Plex Mono 10px `--text-3`

### List View
Dense table with columns: # · Cover (40×56px thumb) · Title · Type · User Score · Official Score · Status · Progress · Date Added · Actions (edit icon)  
Alternating row backgrounds: `--surface-2` / `--surface-1`. Watching rows get a 2px `--accent` left border.

---

## PAGE 2 — EXPLORE

**Purpose:** Search and discover anime/manga via Jikan API. Add them to your library.

### Layout
Full-width search bar at top (IBM Plex Mono placeholder "SEARCH TITLE, AUTHOR, STUDIO...").  
Below: filter pills row — Genre · Season · Studio · Type (Anime/Manga).  
Grid/list view toggle top-right.

### Featured Hero (top of results when no search active)
- Asymmetric split: **~65% width** large featured card, **35%** right column with 2 stacked smaller editorial cards
- Large card: full-bleed image, diagonal gradient overlay bottom-left to top-right, title in Bebas Neue 36px, genre tags, "FEATURED" stamp badge
- Right cards: image thumbnail + title + genre tags + add button

### Results Grid
- Masonry-style or uniform 4-column grid
- Cards same anatomy as Library cards
- Hover reveals: `[+ ADD TO LIBRARY]` button in cerise — this is the ONLY CTA. No watch/play button.
- If title is already in library, show `[IN LIBRARY ✓]` button in `--teal`

### Curated horizontal strips (below search results)
- "Top Rated This Season" — horizontal scroll row of cards
- "All-Time Classics" — horizontal scroll row
- "Manga Essentials" — horizontal scroll row
- Each strip: section title in Bebas Neue 20px + "VIEW ALL →" link right-aligned

### Jikan API calls
```js
// Search: GET https://api.jikan.moe/v4/anime?q={query}&limit=20
// Top anime: GET https://api.jikan.moe/v4/top/anime?limit=12
// Seasonal: GET https://api.jikan.moe/v4/seasons/now?limit=12
// Anime detail: GET https://api.jikan.moe/v4/anime/{id}
// Manga detail: GET https://api.jikan.moe/v4/manga/{id}
```
Show skeleton loading cards (pulsing `--surface-3` blocks, same card dimensions) while fetching.  
Rate limit: Jikan allows 3 req/sec — debounce search input by 600ms.

---

## PAGE 3 — MY LIST

**Purpose:** Dense tracker table with analytics. Full control over your entries.

### Header
```
一覧 / MY LIST           [042 entries badge]
```

### Analytics Strip (4 stat pills, horizontal row)
Each pill: `--surface-2` background, 1px `--border` border, 8px 16px padding.  
Label in IBM Plex Mono 9px `--text-3` UPPERCASE, value in IBM Plex Mono 18px `--gold` bold.  
Stats: Total Entries · Completed · Currently Watching · Mean Score

### Status Filter Tabs
Underline-style tabs: ALL · WATCHING · COMPLETED · ON HOLD · DROPPED · PLAN TO WATCH  
Active tab: 2px `--accent` bottom border, `--text-1` colour. Default: `--text-3`.

### Table
Columns (in order):
`#` · `Cover` · `Title` · `Type` · `My Score` · `Official Score` · `Status` · `Progress` · `Date Added` · `⋯`

Behaviour:
- **My Score**: click to open inline 1-10 input or 10-star widget (stars fill `--gold`). Shows `--` if unset.
- **Status**: click to open a small dropdown (5 options), styled with `--surface-3`
- **Progress**: `Ep 12 / 24` or `Ch 103 / 189` — click to increment or open edit. IBM Plex Mono.
- **Watching rows**: 2px `--accent` left border on the whole row
- Row hover: `--surface-3` background
- Alternating rows: `--surface-2` / `--surface-1`
- `⋯` action: opens mini menu — Edit · Remove · Toggle Favourite

### Bottom Charts (two side by side)
**Score Distribution** (left, ~60% width):  
Horizontal bar chart, 10 bars (scores 1–10), bar fill `--accent`, bar height 20px, IBM Plex Mono labels.  
Bars have slightly rough/uneven top via `border-radius: 2px 2px 0 0`.

**Genre Breakdown** (right, ~40% width):  
Simple donut chart (SVG or canvas), segments in: `--accent`, `--teal`, `--gold`, `--stone`, `#5B5BFF`, `#C47B3D`.  
Legend below in IBM Plex Mono 10px.

---

## PAGE 4 — PROFILE

**Purpose:** User stats and settings.

### Layout
Two-column: left stats panel, right settings.

### Stats
- Avatar circle (large, 80px), initials or upload
- Username, join date
- Stat grid (2×3): Total Entries · Episodes Watched · Chapters Read · Days Consumed · Favourite Genre · Mean Score
- Each stat: large IBM Plex Mono number in `--gold`, label below in `--text-3`
- Favourite titles: 5 cards in a horizontal row (library items marked as favourite)

### Settings
- Export data (JSON download)
- Import data (JSON upload)
- Clear all data (with confirmation)

---

## ADD TO LIBRARY MODAL

Triggered from any `[+ ADD TO LIBRARY]` button. Overlays the screen.

- Backdrop: `rgba(13,13,18,0.85)` blur
- Modal: `--surface-2` background, 1px `--border-hi` border, 480px wide, 4px radius
- Header: cover thumbnail left, title + year + genres right
- Fields:
  - Status: dropdown (Watching / Completed / On Hold / Dropped / Plan to Watch)
  - Progress: number input (episodes or chapters)
  - My Score: 10-star input (stars fill `--gold` on select)
  - Notes: textarea, `--surface-3` background
- Buttons: `[CANCEL]` outlined, `[ADD TO LIBRARY]` filled cerise

---

## DETAIL VIEW (slide-in panel or full page)

Triggered by clicking any card title or a Detail button.

### Layout
Left column (40%): large cover image, cerise atmospheric glow behind (`box-shadow: 0 0 60px rgba(232,25,75,0.2)`).  
Right column (60%): metadata.

### Right column content
- Title: Bebas Neue 38px
- Meta row: year · type · episode/chapter count · studio/author — IBM Plex Mono 11px `--text-3`
- Genre tags: small pills, `--surface-3` background
- Official score: large IBM Plex Mono, `--gold` colour, "MAL SCORE" label
- User score: 10-star widget (if in library)
- Synopsis: Nunito 14px, `--text-2`, max 4 lines with "Read more"
- Status selector + progress field (if in library)
- `[ADD TO LIBRARY]` button if not in library, `[UPDATE ENTRY]` if it is

### Below the fold — Tabs
`Overview` · `Characters` · `Episodes` (anime) or `Volumes` (manga) · `Related`

**Episodes tab (anime):**  
Numbered list rows. `EP.01 · Title · Duration`. Alternating row backgrounds. IBM Plex Mono for numbers, Nunito for titles. NO thumbnails, NO play buttons. User can tick episodes as "seen" (checkbox marks, IBM Plex Mono checkmark).

**Volumes tab (manga):**  
Same but: `VOL.01 · Volume Title · Chapters X–Y`. User can mark as read.

**Related tab:**  
Cards for sequels, prequels, adaptations. Same card anatomy. `[ADD]` or `[IN LIBRARY]` badges.

---

## INTERACTIONS & ANIMATIONS

### Card hover
```css
.card:hover {
  transform: translateY(-4px);
  border-color: var(--border-hi);
  box-shadow: 0 12px 40px rgba(0,0,0,0.6),
              0 0 0 1px rgba(232,25,75,0.12),
              0 20px 60px rgba(232,25,75,0.05);
  transition: all 0.2s ease;
}
```

### Status badge
`transition: transform 0.15s` — Watching badge is `rotate(-1deg)` at rest, straightens to `rotate(0)` on card hover.

### Page transitions
Fade + subtle translateY(8px) → translateY(0) on view change. 200ms ease.

### Log Progress button
On click: brief `scale(0.96)` → `scale(1)` spring. 120ms.

### Add to Library
Modal opens with `scale(0.95)` → `scale(1)` + `opacity: 0` → `1`. 200ms.

### Loading skeletons
Pulsing animation:
```css
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite;
}
```

---

## STRICTLY FORBIDDEN

- ❌ No "Resume", "Watch Now", "Play", "Continue Watching" buttons or text anywhere
- ❌ No episode progress bars on library cards
- ❌ No streaming-oriented language
- ❌ No warm brown/rust tones — the base must be cool blue-black `#0D0D12`
- ❌ No glassmorphism or backdrop-filter blur on surfaces
- ❌ No Inter, Roboto, Arial, or system fonts
- ❌ No purple gradient backgrounds
- ❌ No border-radius above 6px on any element
- ❌ No neon glow on everything — the cerise accent is used sparingly
- ❌ No generic SaaS dashboard aesthetic

---

## WHAT MAKES THIS MEMORABLE

1. **The palette is cool and cinematic** — `#0D0D12` reads like a dark cinema, not a warm living room
2. **Kanji watermarks** on every page — huge, faint, serif — make it feel like a Japanese publication
3. **Cerise `#E8194B` is the single hot accent** — it only appears where it truly matters (active state, score badge, CTA, Watching tag), so every instance pops
4. **IBM Plex Mono for all data** — every number, score, progress value, and label reads like a database printout, which is exactly what this is
5. **Cards feel like a shelf** — no distracting episode progress bars, no streaming chrome. Just the art, the title, the score.
6. **Status badges are slightly stamped** — Watching badge sits at `-1deg` rotation, like a hanko seal applied by hand

---

## DELIVERABLE

One complete `okami.html` file. All CSS inline in `<style>`. All JS in `<script type="text/babel">`. React + Babel loaded via CDN. Fonts from Google Fonts. Fully functional with localStorage persistence and live Jikan API integration.
