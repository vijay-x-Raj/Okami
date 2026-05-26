# ŌKAMI — Full Integration & Bug-Fix Brief
**For agent use. Read this entire document before touching any file.**

---

## CURRENT STATE SUMMARY

The frontend shell exists in Next.js 16 App Router + TypeScript.  
All four views render. The Jikan proxy routes exist.  
**What is broken:**

| Area | Problem |
|---|---|
| Library filters | Type / Genre / Status pills render but do NOT filter the entries array. Clicking them changes visual state only. |
| Library list view | Toggle exists but list rows are not implemented — clicking list icon shows nothing or falls back to grid. |
| Explore filter pills | Genre / Season / Studio / Type pills are decorative. Selecting them does not re-fetch or re-filter results. |
| Add to Library (Explore) | `+ ADD` button on Explore cards opens the modal but **does not save** to localStorage on confirm. Entry count stays at 001. |
| My List overflow menu `⋯` | Renders `...` text. No menu opens. Edit / Remove / Toggle Favourite are not wired. |
| My List inline score edit | Clicking the score cell does nothing. No inline input appears. |
| My List inline status edit | Clicking the status pill does nothing. No dropdown appears. |
| My List inline progress edit | `2 / 16` is static text. Not editable. |
| My List donut chart | Static SVG — does not use real genre data from entries. |
| Profile Favourite Titles | Hardcoded text blocks ("BERSERK", "MONSTER" etc). Not pulled from entries where `is_favourite: true`. |
| Profile Export | Button renders but `onClick` is a no-op. |
| Profile Import | Button renders but `onClick` is a no-op. |
| Profile Clear All | Button renders but `onClick` is a no-op (or not confirmed). |
| Detail panel tabs | Only Overview tab content shows. Episodes / Volumes / Related tabs render empty. |
| Log Progress button | Opens modal but "which entry?" context is lost — modal opens with no pre-selected entry. |
| localStorage sync | After adding an entry, Library and My List do not re-render without a page refresh. State is not reactive. |

---

## FILE MAP — WHAT TO TOUCH

```
app/
  page.tsx                  ← main view switcher, global state, ALL fixes live here or are triggered from here
  globals.css               ← do not change colours or typography — only add missing utility classes
  lib/
    storage.ts              ← add missing CRUD helpers (updateEntry, removeEntry, toggleFavourite)
    jikan.ts                ← add getAnimeEpisodes(), getMangaVolumes(), getRelated()
    api.ts                  ← add missing client fetch helpers
  api/
    jikan/
      search/route.ts       ← already exists
      top/route.ts          ← already exists
      season/route.ts       ← already exists
      detail/route.ts       ← already exists
      episodes/route.ts     ← CREATE THIS
      volumes/route.ts      ← CREATE THIS (manga chapters endpoint)
```

---

## 1. GLOBAL STATE — Make localStorage Reactive

**Problem:** `entries` is read once on mount. Adding/editing/removing does not trigger re-renders across views.

**Fix:** In `app/page.tsx`, manage entries with `useState` + a central mutator pattern.  
Every write to localStorage must also call `setEntries(newArray)`.

```tsx
// app/page.tsx — top of component
const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());

// Single source of truth mutator — use this everywhere
function commitEntries(next: OkamiEntry[]) {
  saveEntries(next);   // writes to localStorage
  setEntries(next);    // triggers re-render
}
```

Pass `entries` and `commitEntries` as props down to all four view components.  
**Never call `loadEntries()` inside child components.** They receive entries as a prop.

---

## 2. STORAGE HELPERS — `app/lib/storage.ts`

Ensure these functions exist and are exported:

```ts
export function loadEntries(): OkamiEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('okami_entries') || '[]');
  } catch { return []; }
}

export function saveEntries(entries: OkamiEntry[]): void {
  localStorage.setItem('okami_entries', JSON.stringify(entries));
}

export function addEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  if (entries.find(e => e.id === entry.id && e.type === entry.type)) return entries;
  return [...entries, { ...entry, date_added: new Date().toISOString() }];
}

export function updateEntry(entries: OkamiEntry[], id: number, type: string, patch: Partial<OkamiEntry>): OkamiEntry[] {
  return entries.map(e => (e.id === id && e.type === type) ? { ...e, ...patch } : e);
}

export function removeEntry(entries: OkamiEntry[], id: number, type: string): OkamiEntry[] {
  return entries.filter(e => !(e.id === id && e.type === type));
}

export function toggleFavourite(entries: OkamiEntry[], id: number, type: string): OkamiEntry[] {
  return entries.map(e => (e.id === id && e.type === type) ? { ...e, is_favourite: !e.is_favourite } : e);
}
```

---

## 3. LIBRARY VIEW — Wire All Filters

**Current problem:** `activeType`, `activeGenre`, `activeStatus` state exists but the filtered display array is never computed from it.

**Fix:** Derive `displayedEntries` from `entries` + filter state on every render. No useEffect needed — pure derivation.

```tsx
// Inside LibraryView component
const displayedEntries = useMemo(() => {
  let result = [...entries];

  // Type filter
  if (activeType !== 'all') {
    if (activeType === 'films') {
      result = result.filter(e => e.format?.toLowerCase() === 'film' || e.format?.toLowerCase() === 'movie');
    } else {
      result = result.filter(e => e.type === activeType); // 'anime' | 'manga'
    }
  }

  // Genre filter (activeGenre is a string like 'action')
  if (activeGenre) {
    result = result.filter(e =>
      e.genres?.some(g => g.toLowerCase() === activeGenre.toLowerCase())
    );
  }

  // Status filter
  if (activeStatus) {
    result = result.filter(e => e.status === activeStatus);
  }

  // Sort
  result.sort((a, b) => {
    if (sortBy === 'score')       return (b.user_score ?? 0) - (a.user_score ?? 0);
    if (sortBy === 'title')       return a.title.localeCompare(b.title);
    if (sortBy === 'year')        return (b.year ?? 0) - (a.year ?? 0);
    if (sortBy === 'official')    return (b.official_score ?? 0) - (a.official_score ?? 0);
    // default: date_added desc
    return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
  });

  return result;
}, [entries, activeType, activeGenre, activeStatus, sortBy]);
```

**Count row** must show:
```tsx
ENTRIES <span className="accent">{entries.length.toString().padStart(3,'0')}</span>
SHOWING <span className="accent">{displayedEntries.length.toString().padStart(2,'0')}</span>
```

**Filter pill click handlers** — each pill group is mutually exclusive within its group:
```tsx
// Type pills
onClick={() => setActiveType(activeType === value ? 'all' : value)}

// Genre pills — clicking the active one deselects it
onClick={() => setActiveGenre(activeGenre === value ? '' : value)}

// Status pills — clicking the active one deselects it
onClick={() => setActiveStatus(activeStatus === value ? '' : value)}
```

**Active pill style** — when `activeType/activeGenre/activeStatus` matches:
```css
.pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
```

---

## 4. LIBRARY — List View

The list toggle currently does nothing useful. Wire it fully.

```tsx
// State
const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

// Render switch
{viewMode === 'grid' ? <GridView entries={displayedEntries} ... /> : <ListView entries={displayedEntries} ... />}
```

**ListView table columns (in order):**
`#` · `Cover` (40×56 `<img>`) · `Title` · `Type` · `My Score` · `Official Score` · `Status` · `Progress` · `Date Added` · `⋯`

Each row:
- Background: alternating `--surface-2` / `--surface-1`
- Watching rows: 2px `--accent` left border on `<tr>`
- Clicking `⋯` opens a small absolute-positioned menu: Edit · Remove · Toggle Favourite (see Section 7)

---

## 5. EXPLORE — Wire Filter Pills

**Current problem:** Genre/Season/Studio/Type pills are purely visual. They never modify the API query.

**Filter state in ExploreView:**
```tsx
const [activeGenres, setActiveGenres] = useState<string[]>([]);
const [activeSeason, setActiveSeason] = useState('');
const [activeStudio, setActiveStudio] = useState('');
const [activeType, setActiveType] = useState<'anime'|'manga'>('anime');
```

**Search function** — call this whenever any filter changes OR search query changes (debounced 600ms for query, immediate for filters):
```tsx
async function runSearch() {
  if (!searchQuery && !activeGenres.length && !activeSeason && !activeStudio) {
    // No active search — show default strips (seasonal, top)
    setResults([]);
    setIsSearching(false);
    return;
  }

  setIsSearching(true);
  setLoading(true);

  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (activeGenres.length) params.set('genres', activeGenres.join(','));
  if (activeSeason) params.set('season', activeSeason);
  if (activeStudio) params.set('studio', activeStudio);
  params.set('type', activeType);
  params.set('limit', '20');

  const res = await fetch(`/api/jikan/search?${params}`);
  const data = await res.json();
  setResults(data.results ?? []);
  setLoading(false);
}

useEffect(() => { runSearch(); }, [activeGenres, activeSeason, activeStudio, activeType]);
```

**Jikan genre IDs** — map pill labels to Jikan genre IDs:
```ts
const GENRE_MAP: Record<string, number> = {
  action: 1, adventure: 2, comedy: 4, drama: 8,
  fantasy: 10, horror: 14, romance: 22, 'sci-fi': 24,
  seinen: 42, shonen: 27, sports: 30, supernatural: 37,
};
```

**Update `/api/jikan/search/route.ts`** to accept and forward genre/season/studio params:
```ts
// app/api/jikan/search/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q       = searchParams.get('q') ?? '';
  const genres  = searchParams.get('genres') ?? '';      // comma-separated IDs
  const season  = searchParams.get('season') ?? '';
  const studio  = searchParams.get('studio') ?? '';
  const type    = searchParams.get('type') ?? 'anime';
  const limit   = searchParams.get('limit') ?? '20';

  const jikanParams = new URLSearchParams({ limit });
  if (q)      jikanParams.set('q', q);
  if (genres) jikanParams.set('genres', genres);
  if (season) jikanParams.set('season', season); // note: Jikan season filter is different for /seasons endpoint

  const base = type === 'manga' ? 'manga' : 'anime';
  const url  = `https://api.jikan.moe/v4/${base}?${jikanParams}`;

  const res  = await fetch(url, { cache: 'no-store' });
  const json = await res.json();

  return Response.json({ results: (json.data ?? []).map(normalizeJikan) });
}
```

---

## 6. ADD TO LIBRARY — Fix the Save Flow

**Problem:** The modal confirms but entry is never persisted. `commitEntries` is not called.

**Add modal `onConfirm` handler** (in `app/page.tsx` or wherever modal lives):
```tsx
function handleAddEntry(formData: AddEntryFormData) {
  const newEntry: OkamiEntry = {
    id:             formData.jikanId,
    type:           formData.mediaType,
    title:          formData.title,
    cover:          formData.cover,
    year:           formData.year,
    format:         formData.format,
    genres:         formData.genres,
    official_score: formData.officialScore,
    user_score:     formData.userScore ?? null,
    status:         formData.status,
    progress:       formData.progress ?? 0,
    total:          formData.total ?? null,
    date_added:     new Date().toISOString(),
    notes:          formData.notes ?? '',
    is_favourite:   false,
  };
  commitEntries(addEntry(entries, newEntry));
  setModalOpen(false);
}
```

**Critical:** The `pendingEntry` object (the Jikan card data) must be passed INTO the modal when it opens from an Explore card. The modal must not start empty.

```tsx
// When user clicks + ADD on an Explore card:
function openAddModal(jikanItem: NormalizedJikanItem) {
  setPendingEntry(jikanItem);   // store which item we're adding
  setModalMode('add');
  setModalOpen(true);
}
```

---

## 7. MY LIST — Inline Editing

### 7a. Inline Score Edit
```tsx
// In each table row, My Score cell:
const [editingScore, setEditingScore] = useState<string | null>(null); // stores "id-type" key

function ScoreCell({ entry }: { entry: OkamiEntry }) {
  const key = `${entry.id}-${entry.type}`;
  if (editingScore === key) {
    return (
      <input
        type="number" min={1} max={10} step={0.5}
        defaultValue={entry.user_score ?? ''}
        autoFocus
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val) && val >= 1 && val <= 10) {
            commitEntries(updateEntry(entries, entry.id, entry.type, { user_score: val }));
          }
          setEditingScore(null);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingScore(null); }}
        style={{ width: 48, background: 'var(--surface-3)', border: '1px solid var(--accent)', color: 'var(--text-1)', padding: '2px 6px', fontFamily: 'IBM Plex Mono' }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditingScore(key)}
      style={{ cursor: 'pointer', color: entry.user_score ? 'var(--gold)' : 'var(--text-3)' }}
      title="Click to edit score"
    >
      {entry.user_score ?? '--'}
    </span>
  );
}
```

### 7b. Inline Status Edit
```tsx
function StatusCell({ entry }: { entry: OkamiEntry }) {
  const [open, setOpen] = useState(false);
  const statuses = ['watching','completed','on_hold','dropped','plan_to_watch'];

  return (
    <div style={{ position: 'relative' }}>
      <span
        className={`status-badge ${entry.status}`}
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer' }}
      >
        {entry.status.replace('_', ' ').toUpperCase()}
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100,
          background: 'var(--surface-3)', border: '1px solid var(--border-hi)',
          borderRadius: 4, overflow: 'hidden', minWidth: 160, marginTop: 4,
        }}>
          {statuses.map(s => (
            <div
              key={s}
              onClick={() => {
                commitEntries(updateEntry(entries, entry.id, entry.type, { status: s as any }));
                setOpen(false);
              }}
              style={{
                padding: '8px 12px',
                fontFamily: 'IBM Plex Mono', fontSize: 10, letterSpacing: 1,
                color: s === entry.status ? 'var(--accent)' : 'var(--text-2)',
                cursor: 'pointer', textTransform: 'uppercase',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-4)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {s.replace('_', ' ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 7c. Inline Progress Edit
```tsx
function ProgressCell({ entry }: { entry: OkamiEntry }) {
  const [editing, setEditing] = useState(false);
  const unit = entry.type === 'manga' ? 'Ch' : 'Ep';

  if (editing) {
    return (
      <input
        type="number" min={0} max={entry.total ?? 9999}
        defaultValue={entry.progress}
        autoFocus
        onBlur={(e) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val) && val >= 0) {
            commitEntries(updateEntry(entries, entry.id, entry.type, { progress: val }));
          }
          setEditing(false);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width: 52, background: 'var(--surface-3)', border: '1px solid var(--border-hi)', color: 'var(--text-1)', padding: '2px 6px', fontFamily: 'IBM Plex Mono', fontSize: 11 }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit progress"
      style={{ cursor: 'pointer', fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-2)' }}
    >
      {unit} {entry.progress} / {entry.total ?? '?'}
    </span>
  );
}
```

### 7d. Overflow Menu `⋯`

```tsx
function RowMenu({ entry }: { entry: OkamiEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>⋯</button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 200,
          background: 'var(--surface-3)', border: '1px solid var(--border-hi)',
          borderRadius: 4, overflow: 'hidden', minWidth: 160, marginTop: 4,
        }}>
          {[
            { label: 'Edit Entry',         action: () => { openEditModal(entry); setOpen(false); } },
            { label: 'Toggle Favourite',   action: () => { commitEntries(toggleFavourite(entries, entry.id, entry.type)); setOpen(false); } },
            { label: 'Remove',             action: () => { if (confirm(`Remove "${entry.title}"?`)) { commitEntries(removeEntry(entries, entry.id, entry.type)); } setOpen(false); }, danger: true },
          ].map(item => (
            <div key={item.label} onClick={item.action} style={{
              padding: '9px 14px',
              fontFamily: 'IBM Plex Mono', fontSize: 10, letterSpacing: 1,
              color: item.danger ? 'var(--accent)' : 'var(--text-2)',
              cursor: 'pointer', textTransform: 'uppercase',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-4)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Close any open menu when clicking outside — add a `useEffect` with a document click listener that calls `setOpen(false)` for all open menus.

---

## 8. MY LIST — Live Charts

### Score Distribution (already partially working — fix data binding)
```tsx
const scoreDistribution = useMemo(() => {
  const counts = Array(10).fill(0);
  entries.forEach(e => {
    if (e.user_score && e.user_score >= 1 && e.user_score <= 10) {
      counts[Math.round(e.user_score) - 1]++;
    }
  });
  return counts; // index 0 = score 1, index 9 = score 10
}, [entries]);

const maxCount = Math.max(...scoreDistribution, 1);
```

Render bars: each bar width = `(count / maxCount) * 100%`. Fill: `var(--accent)`. Height: 20px each row. Label left: score number. Label right: count.

### Genre Donut — wire to real data
```tsx
const genreData = useMemo(() => {
  const map: Record<string, number> = {};
  entries.forEach(e => {
    e.genres?.forEach(g => { map[g] = (map[g] ?? 0) + 1; });
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6); // top 6 genres
}, [entries]);

const DONUT_COLORS = ['#E8194B','#3DB89C','#C4A84F','#4A4A5A','#5B5BFF','#C47B3D'];
```

Build SVG donut from `genreData`. If `entries.length === 0`, show an empty ring with "NO DATA" label at center.

---

## 9. PROFILE — Wire All Actions

### Favourite Titles
```tsx
const favourites = useMemo(() => entries.filter(e => e.is_favourite), [entries]);

// Render actual cards with cover images, not static text blocks
// Show max 5. If none: "No favourites yet — mark entries with ♡ in My List"
```

### Export Data
```tsx
function handleExport() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `okami-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Import Data
```tsx
function handleImport() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const imported: OkamiEntry[] = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error();
      // Merge: keep existing entries not in import, add all imported
      const merged = [...entries];
      imported.forEach(imp => {
        if (!merged.find(ex => ex.id === imp.id && ex.type === imp.type)) {
          merged.push(imp);
        }
      });
      commitEntries(merged);
      alert(`Imported ${imported.length} entries.`);
    } catch {
      alert('Invalid file. Expected a valid Ōkami JSON backup.');
    }
  };
  input.click();
}
```

### Clear All Data
```tsx
function handleClear() {
  if (confirm('This will permanently delete all your entries. Are you sure?')) {
    if (confirm('Last chance — this cannot be undone.')) {
      commitEntries([]);
    }
  }
}
```

---

## 10. DETAIL PANEL — Wire Tabs

### New Jikan route: `/api/jikan/episodes/route.ts`
```ts
import { NextRequest } from 'next/server';
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ episodes: [] });
  const res  = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes`, { next: { revalidate: 3600 } });
  const json = await res.json();
  return Response.json({ episodes: json.data ?? [] });
}
```

### New Jikan route: `/api/jikan/volumes/route.ts` (manga)
```ts
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ volumes: [] });
  // Jikan doesn't have a volumes endpoint; use chapters list
  const res  = await fetch(`https://api.jikan.moe/v4/manga/${id}/characters`, { next: { revalidate: 3600 } });
  const json = await res.json();
  return Response.json({ data: json.data ?? [] });
}
```

### Detail panel tab rendering

```tsx
type DetailTab = 'overview' | 'episodes' | 'volumes' | 'related';
const [activeTab, setActiveTab] = useState<DetailTab>('overview');
const [episodes, setEpisodes]   = useState<any[]>([]);
const [tabLoading, setTabLoading] = useState(false);

async function handleTabChange(tab: DetailTab) {
  setActiveTab(tab);
  if (tab === 'episodes' && selectedItem?.type === 'anime' && episodes.length === 0) {
    setTabLoading(true);
    const res  = await fetch(`/api/jikan/episodes?id=${selectedItem.id}`);
    const data = await res.json();
    setEpisodes(data.episodes);
    setTabLoading(false);
  }
}
```

**Episodes tab render:**
```tsx
{activeTab === 'episodes' && (
  <div>
    {tabLoading
      ? <SkeletonRows count={12} />
      : episodes.map((ep, i) => (
          <div key={ep.mal_id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '10px 0', borderBottom: '1px solid var(--border)',
            background: i % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)',
          }}>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-3)', minWidth: 48 }}>
              EP.{String(ep.mal_id).padStart(2,'0')}
            </span>
            <span style={{ flex: 1, fontFamily: 'Nunito', fontSize: 13 }}>{ep.title ?? `Episode ${ep.mal_id}`}</span>
            {ep.duration && (
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-3)' }}>{ep.duration}</span>
            )}
          </div>
        ))
    }
    {!tabLoading && episodes.length === 0 && (
      <p style={{ color: 'var(--text-3)', fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '24px 0' }}>
        NO EPISODE DATA AVAILABLE
      </p>
    )}
  </div>
)}
```

**Related tab render:**
- Fetch `https://api.jikan.moe/v4/anime/{id}/relations` (or manga)
- Show cards with title, relation type (Sequel, Prequel, etc), and `[+ ADD]` / `[IN LIBRARY]` badge

---

## 11. LOG PROGRESS BUTTON — Fix Context

**Current problem:** The sidebar `+ LOG PROGRESS` button opens a modal with no entry pre-selected.

**Fix:** The button should open the modal in a "quick log" mode that shows a searchable dropdown of all current library entries.

```tsx
function LogProgressModal({ entries, onCommit, onClose }) {
  const [query, setQuery]       = useState('');
  const [selected, setSelected] = useState<OkamiEntry | null>(null);
  const [newProgress, setNewProgress] = useState('');

  const filtered = entries.filter(e =>
    e.title.toLowerCase().includes(query.toLowerCase())
  );

  function handleSave() {
    if (!selected) return;
    const val = parseInt(newProgress);
    if (!isNaN(val) && val >= 0) {
      onCommit(updateEntry(entries, selected.id, selected.type, { progress: val }));
    }
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 3 }}>LOG PROGRESS</h2>
      <input
        placeholder="SEARCH YOUR LIBRARY..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ /* same input style as elsewhere */ }}
      />
      <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
        {filtered.map(e => (
          <div key={`${e.id}-${e.type}`} onClick={() => { setSelected(e); setNewProgress(String(e.progress)); }}
            style={{
              padding: '8px 12px', cursor: 'pointer',
              background: selected?.id === e.id ? 'var(--surface-4)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
            <img src={e.cover} alt="" style={{ width: 28, height: 40, objectFit: 'cover', borderRadius: 2 }} />
            <div>
              <div style={{ fontFamily: 'Nunito', fontSize: 13, fontWeight: 700 }}>{e.title}</div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-3)' }}>
                {e.type === 'manga' ? 'Ch' : 'Ep'} {e.progress} / {e.total ?? '?'}
              </div>
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-2)' }}>
            NEW {selected.type === 'manga' ? 'CHAPTER' : 'EPISODE'}:
          </span>
          <input
            type="number" value={newProgress} onChange={e => setNewProgress(e.target.value)}
            min={0} max={selected.total ?? 9999}
            style={{ width: 64, background: 'var(--surface-3)', border: '1px solid var(--border-hi)', color: 'var(--text-1)', padding: '4px 8px', fontFamily: 'IBM Plex Mono', fontSize: 13 }}
          />
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-3)' }}>
            / {selected.total ?? '?'}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <button onClick={onClose} className="btn-outline">CANCEL</button>
        <button onClick={handleSave} className="btn-primary" disabled={!selected || !newProgress}>SAVE</button>
      </div>
    </ModalOverlay>
  );
}
```

---

## 12. CLOSE MENUS ON OUTSIDE CLICK

Any open dropdown (status, overflow menu, etc.) must close when clicking outside it.

```tsx
// Generic hook — use in any component with an open/setOpen
function useOutsideClick(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
}
```

---

## 13. EMPTY STATES

Each view needs a proper empty state — not a blank area.

**Library (no entries at all):**
```
[Large faint 本棚 kanji]
YOUR VAULT IS EMPTY
Add titles from Explore to start tracking
[EXPLORE NOW →] button in accent
```

**Library (filters return nothing):**
```
NO ENTRIES MATCH THIS FILTER
Try adjusting your filters or add more titles
[CLEAR FILTERS] text link
```

**My List (no entries):**
```
NOTHING TO TRACK YET
Go to Explore and add some titles to your library
```

**Explore (search returns nothing):**
```
NO RESULTS FOR "{query}"
Try a different title, author, or studio
```

---

## 14. LOADING & ERROR STATES

### Skeleton cards (Explore grid while fetching)
```tsx
function SkeletonCard() {
  return (
    <div style={{ borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
      <div className="skeleton" style={{ aspectRatio: '2/3', width: '100%' }} />
      <div style={{ padding: '10px 10px 12px' }}>
        <div className="skeleton" style={{ height: 13, borderRadius: 2, marginBottom: 6, width: '80%' }} />
        <div className="skeleton" style={{ height: 10, borderRadius: 2, width: '50%' }} />
      </div>
    </div>
  );
}
```

### API error state (Explore)
```tsx
{error && (
  <div style={{ padding: '32px 0', fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
    JIKAN API UNAVAILABLE — PLEASE TRY AGAIN
    <button onClick={runSearch} style={{ marginLeft: 16, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono', fontSize: 11, textDecoration: 'underline' }}>RETRY</button>
  </div>
)}
```

---

## 15. IMPLEMENTATION ORDER

Fix in this exact order to avoid cascading breakage:

1. **`storage.ts`** — add `updateEntry`, `removeEntry`, `toggleFavourite` helpers
2. **`page.tsx`** — implement `commitEntries`, pass `entries` as prop to all views
3. **Library filters** — wire `useMemo` derivation (biggest UX fix, most visible)
4. **Add to Library save** — fix `onConfirm` to call `commitEntries(addEntry(...))`
5. **Library list view** — implement table rows
6. **My List inline editing** — score, status, progress, overflow menu
7. **My List charts** — wire to live `entries` data
8. **Explore filter pills** — update search route + re-fetch on filter change
9. **Profile actions** — export, import, clear, real favourites
10. **Log Progress modal** — entry picker
11. **Detail panel tabs** — episodes/volumes routes + rendering
12. **Empty & error states**
13. **Outside-click dismissal** for all dropdowns

---

## DO NOT CHANGE

- CSS variable names or values — the palette is correct
- Font families — Bebas Neue, IBM Plex Mono, Nunito
- Card aspect ratio (2:3)
- The 220px sidebar width
- The Jikan API base URL or normalization logic in `jikan.ts` (unless adding new fields)
- Status badge colour assignments
- The `okami_entries` localStorage key

---

## TESTING CHECKLIST — verify each before marking done

- [ ] Add an anime from Explore → appears immediately in Library and My List without refresh
- [ ] Library Type pill "MANGA" → shows only manga entries
- [ ] Library Genre pill "ACTION" → shows only entries with Action genre
- [ ] Library Status "WATCHING" → shows only watching entries
- [ ] Library filter combinations (Type + Status simultaneously) work
- [ ] Library sort "Score" → entries re-order by user score descending
- [ ] Library list view shows dense table with all columns
- [ ] My List score cell click → inline input appears, saving updates value
- [ ] My List status pill click → dropdown appears, selecting updates row
- [ ] My List progress click → inline input appears, saving updates value
- [ ] My List `⋯` menu → Edit / Toggle Favourite / Remove all work
- [ ] My List Remove → entry disappears from Library too (same state)
- [ ] My List score distribution chart updates when scores are added/changed
- [ ] My List genre donut uses real genre data from entries
- [ ] Explore Genre pill "ACTION" → results re-fetch with action genre filter
- [ ] Explore Type toggle Anime ↔ Manga → results switch
- [ ] Profile Export → downloads valid JSON file
- [ ] Profile Import → merges entries, count updates
- [ ] Profile Clear → confirms twice, empties Library and My List
- [ ] Profile Favourite Titles shows entries where `is_favourite: true`
- [ ] Log Progress button → opens picker, selecting entry updates progress
- [ ] Detail panel Episodes tab → fetches and lists episode data
- [ ] All dropdowns close when clicking outside
- [ ] Empty state shows in Library when no entries exist
