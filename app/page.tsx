"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaType, OkamiMedia } from "./lib/jikan";
import { fetchDetail } from "./lib/api";
import {
  addEntry,
  type OkamiEntry,
  type OkamiStatus,
  loadEntries,
  removeEntry,
  saveEntries,
  toggleFavourite,
  updateEntry,
  loadFranchiseEntries,
  saveFranchiseEntries,
  migrateLegacyEntries,
  exportLibraryAsJson,
  importLibraryFromJson,
  incrementEpisode,
  incrementChapter,
  appendHistory,
  findFranchiseByMalId,
  type UnifiedFranchiseEntry,
  type FranchiseItemOption,
  bundleFranchiseEntries,
  importFromMAL,
  importFromAniList,
} from "./lib/storage";
import {
  type UnifiedLibraryItem,
  entryKey,
  mediaKey,
  entryToMedia,
  buildUnifiedLibraryItems,
  sortOptions,
} from "./lib/libraryUtils";
import { Toast, type ToastData } from "./components/Toast";
import { ProfileView } from "./components/ProfileView";
import { LogProgressModal } from "./components/LogProgressModal";
import { DetailPanel } from "./components/DetailPanel";
import { FolderModal } from "./components/FolderModal";
import { AddEntryModal } from "./components/AddEntryModal";
import { LibraryView } from "./components/LibraryView";
import { MyListView } from "./components/MyListView";
import { ExploreView } from "./components/ExploreView";

const navItems = [
  {
    label: "Library",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 19V6a2 2 0 012-2h12a2 2 0 012 2v13M4 19a2 2 0 002 2h12a2 2 0 002-2M4 19h16M9 3v4m6-4v4" />
      </svg>
    ),
  },
  {
    label: "Explore",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
  {
    label: "My List",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 6h18M3 12h18M3 18h11" />
      </svg>
    ),
  },
  {
    label: "Profile",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Library");
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okami_active_tab");
      if (saved === "Manga" || saved === "Anime") return saved;
    }
    return "Anime";
  });
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [activeType, setActiveType] = useState<"all" | "anime" | "manga" | "films" | "folders">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okami_active_tab");
      if (saved === "Manga") return "manga";
    }
    return "anime";
  });
  const [activeGenre, setActiveGenre] = useState("");
  const [activeStatus, setActiveStatus] = useState<OkamiStatus | "favorites" | "">("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]>("Last Updated");
  const [openFolderItem, setOpenFolderItem] = useState<UnifiedLibraryItem | null>(null);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const mediaType = tab.toLowerCase() === "manga" ? "manga" : "anime";
    setActiveType(mediaType);
    if (typeof window !== "undefined") {
      localStorage.setItem("okami_active_tab", tab);
      document.documentElement.setAttribute("data-theme", mediaType);
    }
  }, []);

  const [entries, setEntries] = useState<OkamiEntry[]>(() => loadEntries());
  const [franchises, setFranchises] = useState<Record<string, UnifiedFranchiseEntry>>(() => {
    migrateLegacyEntries();
    return loadFranchiseEntries();
  });

  useEffect(() => {
    migrateLegacyEntries();
    Promise.resolve().then(() => {
      setFranchises(loadFranchiseEntries());
    });
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("okami_active_tab");
      const currentTab = saved === "Manga" || saved === "Anime" ? saved : "Anime";
      const mediaType = currentTab.toLowerCase() === "manga" ? "manga" : "anime";
      setActiveTab(currentTab);
      setActiveType(mediaType);
      document.documentElement.setAttribute("data-theme", mediaType);
    }
  }, []);

  const commitEntries = useCallback((next: OkamiEntry[]) => {
    saveEntries(next);
    setEntries(next);
  }, []);

  const commitFranchises = useCallback((next: Record<string, UnifiedFranchiseEntry>) => {
    saveFranchiseEntries(next);
    setFranchises(next);
  }, []);

  const [toastMessage, setToastMessage] = useState<ToastData | null>(null);

  const showToast = useCallback((text: string, type: "info" | "success" | "warning" = "success") => {
    const id = Date.now();
    setToastMessage({ id, text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.id === id ? null : prev));
    }, 2800);
  }, []);

  const handleQuickIncrement = useCallback(
    (item: UnifiedLibraryItem) => {
      if (item.franchise) {
        const fId = item.franchise.franchiseId;
        if (item.type === "manga") {
          const mangaId = item.activeMalId;
          const nextFranchises = incrementChapter(franchises, fId, mangaId);
          commitFranchises(nextFranchises);
          showToast(`+1 Chapter: ${item.title}`);
        } else {
          const seasonId = item.activeMalId;
          const nextFranchises = incrementEpisode(franchises, fId, seasonId);
          commitFranchises(nextFranchises);
          showToast(`+1 Episode: ${item.title}`);
        }
      }

      if (item.legacyEntry) {
        const e = item.legacyEntry;
        const maxTotal = e.total && e.total > 0 ? e.total : Infinity;
        const nextProg = Math.min(e.progress + 1, maxTotal);
        const nextStat: OkamiStatus = e.total && nextProg >= e.total ? "completed" : "watching";
        commitEntries(
          updateEntry(entries, e.id, e.type, {
            progress: nextProg,
            status: nextStat,
          })
        );
        showToast(`+1 Progress: ${e.title}`);
      }
    },
    [franchises, entries, commitFranchises, commitEntries, showToast]
  );

  const [modalState, setModalState] = useState<{ media: OkamiMedia; entry?: OkamiEntry } | null>(null);
  const [detailMedia, setDetailMedia] = useState<OkamiMedia | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logProgressOpen, setLogProgressOpen] = useState(false);

  // Global Keyboard Shortcuts (/ to search, Escape to dismiss dialogs)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (modalState) setModalState(null);
        else if (detailMedia) setDetailMedia(null);
        else if (openFolderItem) setOpenFolderItem(null);
        else if (logProgressOpen) setLogProgressOpen(false);
      } else if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(".search-input, .mylist-search-input");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalState, detailMedia, openFolderItem, logProgressOpen]);

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entryKey(entry), entry])), [entries]);

  // Real-time calculated profile statistics
  const profileStats = useMemo(() => {
    const totalFranchises = Object.keys(franchises).length;
    let episodesWatched = 0;
    let chaptersRead = 0;
    let volumesRead = 0;

    for (const f of Object.values(franchises)) {
      if (f.anime?.seasons) {
        for (const s of Object.values(f.anime.seasons)) {
          episodesWatched += s.episodesWatched || 0;
        }
      }
      if (f.manga?.series) {
        for (const m of Object.values(f.manga.series)) {
          chaptersRead += m.chaptersRead || 0;
          volumesRead += m.volumesRead || 0;
        }
      }
    }

    // Include any legacy entries
    for (const e of entries) {
      if (!findFranchiseByMalId(franchises, e.id)) {
        if (e.type === "anime") episodesWatched += e.progress || 0;
        else chaptersRead += e.progress || 0;
      }
    }

    const totalTracked = Math.max(totalFranchises, entries.length);
    const daysConsumed = ((episodesWatched * 24 + chaptersRead * 5) / (60 * 24)).toFixed(1);

    const genreMap = new Map<string, number>();
    for (const e of entries) {
      e.genres?.forEach((g) => genreMap.set(g, (genreMap.get(g) || 0) + 1));
    }
    for (const f of Object.values(franchises)) {
      f.genres?.forEach((g) => genreMap.set(g, (genreMap.get(g) || 0) + 1));
    }
    const favoriteGenre = Array.from(genreMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "--";

    const scored = entries.filter((e) => typeof e.user_score === "number" && e.user_score > 0);
    const meanScore = scored.length
      ? (scored.reduce((sum, e) => sum + (e.user_score || 0), 0) / scored.length).toFixed(1)
      : "--";

    return [
      { label: "Franchises", value: String(totalTracked).padStart(3, "0") },
      { label: "Episodes Watched", value: String(episodesWatched) },
      { label: "Chapters Read", value: String(chaptersRead) },
      { label: "Volumes Read", value: String(volumesRead) },
      { label: "Days Consumed", value: daysConsumed },
      { label: "Mean Score", value: meanScore },
      { label: "Favorite Genre", value: favoriteGenre },
    ];
  }, [franchises, entries]);

  const favourites = useMemo(() => entries.filter((entry) => entry.is_favourite), [entries]);

  const viewClass =
    activeNav === "Explore"
      ? "explore"
      : activeNav === "My List"
        ? "list"
        : activeNav === "Profile"
          ? "profile"
          : "library";

  const handleSaveEntry = (data: {
    status: OkamiStatus;
    userScore: number | null;
    notes: string;
    progress: number;
    completedSeasons: number[];
    completedVolumes: number[];
    selectedFranchiseItems?: FranchiseItemOption[];
  }) => {
    if (!modalState) return;
    const { media, entry } = modalState;
    const now = new Date().toISOString();

    let finalStatus = data.status;
    const maxTotal = media.total && media.total > 0 ? media.total : Infinity;
    const clampedProgress = Math.max(0, Math.min(data.progress, maxTotal));

    if (clampedProgress > 0 && finalStatus === "plan_to_watch") {
      finalStatus = "watching";
    }
    if (media.total && clampedProgress >= media.total) {
      finalStatus = "completed";
    }

    const nextEntry: OkamiEntry = {
      id: media.id,
      type: media.type,
      title: media.title,
      cover: media.cover,
      year: media.year,
      format: media.format,
      genres: media.genres,
      official_score: media.official_score,
      user_score: data.userScore,
      status: finalStatus,
      progress: clampedProgress,
      total: media.total ?? null,
      completed_seasons: [],
      completed_volumes: [],
      completed_episodes: Array.from({ length: clampedProgress }, (_, i) => i + 1),
      date_added: entry?.date_added ?? now,
      notes: data.notes,
      is_favourite: entry?.is_favourite ?? false,
    };

    const nextEntries = entry
      ? updateEntry(entries, entry.id, entry.type, nextEntry)
      : addEntry(entries, nextEntry);
    commitEntries(nextEntries);

    // Multi-Select Franchise Bundling into ONE Single Unified Entry
    const primaryOption: FranchiseItemOption = {
      id: media.id,
      title: media.title,
      type: media.type,
      format: media.format || (media.type === "manga" ? "Manga" : "TV"),
      total: media.total ?? null,
      cover: media.cover,
      relation: "Current Title",
      isCurrent: true,
    };

    const selectedOptions =
      data.selectedFranchiseItems && data.selectedFranchiseItems.length > 0
        ? data.selectedFranchiseItems
        : [primaryOption];

    const { updatedFranchises, franchiseId } = bundleFranchiseEntries(
      franchises,
      primaryOption,
      selectedOptions,
      clampedProgress,
      finalStatus,
      data.userScore,
      data.notes
    );

    // If specific seasons were marked completed in data.completedSeasons:
    if (data.completedSeasons.length > 0 && updatedFranchises[franchiseId]?.anime?.seasons) {
      const animeSeasons = { ...updatedFranchises[franchiseId].anime!.seasons };
      for (const sId of data.completedSeasons) {
        if (animeSeasons[sId]) {
          animeSeasons[sId] = {
            ...animeSeasons[sId],
            status: "COMPLETED",
            completedAt: Date.now(),
          };
        }
      }
      updatedFranchises[franchiseId] = {
        ...updatedFranchises[franchiseId],
        anime: {
          ...updatedFranchises[franchiseId].anime!,
          seasons: animeSeasons,
        },
      };
    }

    commitFranchises(updatedFranchises);

    // Append to Mihon append-only history log
    appendHistory({
      franchiseId,
      malId: media.id,
      mediaType: media.type,
      title: media.title,
      coverImage: media.cover,
      number: clampedProgress,
      timestamp: Date.now(),
    });

    setModalState(null);
    showToast(entry ? `Updated "${media.title}"` : `Added "${media.title}" to Library`);
  };

  const handleRemoveEntry = (entry: OkamiEntry) => {
    commitEntries(removeEntry(entries, entry.id, entry.type));
    showToast(`Removed "${entry.title}" from Library`, "info");
  };

  const handleToggleFavourite = (entry: OkamiEntry) => {
    commitEntries(toggleFavourite(entries, entry.id, entry.type));
    showToast(entry.is_favourite ? `Removed from favourites` : `Added "${entry.title}" to favourites`);
  };

  const openDetailById = async (type: MediaType, id: number) => {
    setDetailLoading(true);
    try {
      const detail = await fetchDetail(type, id);
      setDetailMedia(detail);
    } catch {
      setDetailMedia(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openAddById = async (type: MediaType, id: number) => {
    try {
      const detail = await fetchDetail(type, id);
      setModalState({ media: detail, entry: entryMap.get(mediaKey(detail)) });
    } catch {
      setModalState(null);
    }
  };

  const openInfo = (media: OkamiMedia) => {
    if (media.type === "anime") {
      router.push(`/anime/${media.id}/info`);
    } else {
      router.push(`/manga/${media.id}/info`);
    }
  };

  const openTracker = (item: UnifiedLibraryItem) => {
    if (item.type === "manga") {
      router.push(`/manga/${item.activeMalId}`);
    } else {
      router.push(`/anime/${item.activeMalId}`);
    }
  };

  const handleExport = () => {
    const json = exportLibraryAsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `okami-backup-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const success = importLibraryFromJson(text);
        if (success) {
          setEntries(loadEntries());
          setFranchises(loadFranchiseEntries());
          alert("Vault backup successfully imported.");
        } else {
          alert("Invalid backup file format.");
        }
      } catch {
        alert("Failed to parse JSON backup.");
      }
    };
    input.click();
  };

  const handleImportMAL = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,.json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = importFromMAL(text);
        if (res.importedCount > 0) {
          setEntries(loadEntries());
          setFranchises(loadFranchiseEntries());
          alert(`Successfully imported ${res.importedCount} titles from MyAnimeList!`);
        } else {
          alert(`No valid titles could be imported. ${res.errors.join("; ")}`);
        }
      } catch (err) {
        alert(`Failed to import MAL backup: ${err}`);
      }
    };
    input.click();
  };

  const handleImportAniList = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = importFromAniList(text);
        if (res.importedCount > 0) {
          setEntries(loadEntries());
          setFranchises(loadFranchiseEntries());
          alert(`Successfully imported ${res.importedCount} titles from AniList!`);
        } else {
          alert(`No valid titles could be imported. ${res.errors.join("; ")}`);
        }
      } catch (err) {
        alert(`Failed to import AniList backup: ${err}`);
      }
    };
    input.click();
  };

  const handleClear = () => {
    if (confirm("This will permanently delete all your tracked entries and franchise progress. Are you sure?")) {
      if (confirm("Second confirmation: This action is permanent and cannot be undone.")) {
        commitEntries([]);
        commitFranchises({});
      }
    }
  };

  const clearLibraryFilters = () => {
    setActiveType(activeTab.toLowerCase() === "manga" ? "manga" : "anime");
    setActiveGenre("");
    setActiveStatus("");
  };

  return (
    <div className={`app ${activeTab === "Manga" ? "theme-manga" : "theme-anime"}`}>
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-text">ŌKAMI</div>
          <div className="logo-sub">{activeTab === "Manga" ? "MANGA ARCHIVE" : "Digital Vault"}</div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              onClick={() => setActiveNav(item.label)}
              aria-pressed={activeNav === item.label}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="log-btn" type="button" onClick={() => setLogProgressOpen(true)}>
            + Log Progress
          </button>
        </div>
      </aside>

      <main className={`main ${activeTab === "Manga" ? "theme-manga" : "theme-anime"}`}>
        <div className="topbar">
          {["Anime", "Manga"].map((tab) => (
            <button
              key={tab}
              className={`topbar-tab ${tab === "Manga" ? "manga-tab" : "anime-tab"} ${activeTab === tab ? "active" : ""}`}
              type="button"
              onClick={() => handleTabChange(tab)}
              aria-pressed={activeTab === tab}
            >
              {tab}
            </button>
          ))}
          <div className="topbar-right">
            <button
              className="topbar-icon"
              type="button"
              aria-label="Search"
              onClick={() => setActiveNav("Explore")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button
              className="avatar"
              type="button"
              aria-label="Profile"
              onClick={() => setActiveNav("Profile")}
            >
              ŌK
            </button>
          </div>
        </div>

        <div className={`content content-area-bg ${viewClass}`}>
          <div className="content-inner">
            <div key={activeNav} className="view-panel">
              {activeNav === "Library" ? (
                <LibraryView
                  entries={entries}
                  franchises={franchises}
                  onQuickIncrement={handleQuickIncrement}
                  activeView={activeView}
                  setActiveView={setActiveView}
                  activeType={activeType}
                  activeGenre={activeGenre}
                  activeStatus={activeStatus}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  onDetail={openInfo}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onExplore={() => setActiveNav("Explore")}
                  onClearFilters={clearLibraryFilters}
                  onOpenTracker={openTracker}
                  onOpenFolder={setOpenFolderItem}
                />
              ) : null}
              {activeNav === "Explore" ? (
                <ExploreView
                  activeType={activeTab.toLowerCase() === "manga" ? "manga" : "anime"}
                  onTypeChange={(type) => {
                    handleTabChange(type === "manga" ? "Manga" : "Anime");
                  }}
                  entryMap={entryMap}
                  entries={entries}
                  franchises={franchises}
                  onCommitEntries={commitEntries}
                  onCommitFranchises={commitFranchises}
                  onAdd={(media) => setModalState({ media })}
                  onDetail={openInfo}
                />
              ) : null}
              {activeNav === "My List" ? (
                <MyListView
                  entries={entries}
                  franchises={franchises}
                  activeType={activeTab.toLowerCase() === "manga" ? "manga" : "anime"}
                  onEdit={(entry) => setModalState({ media: entryToMedia(entry), entry })}
                  onRemove={handleRemoveEntry}
                  onToggleFavourite={handleToggleFavourite}
                  onCommitEntries={commitEntries}
                  onCommitFranchises={commitFranchises}
                  onOpenTracker={openTracker}
                  onOpenFolder={setOpenFolderItem}
                  onExplore={() => setActiveNav("Explore")}
                />
              ) : null}
              {activeNav === "Profile" ? (
                <ProfileView
                  profileStats={profileStats}
                  favourites={favourites}
                  onExport={handleExport}
                  onImport={handleImport}
                  onImportMAL={handleImportMAL}
                  onImportAniList={handleImportAniList}
                  onClear={handleClear}
                />
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {modalState ? (
        <AddEntryModal
          key={`${modalState.media.id}-${modalState.entry?.date_added ?? "new"}`}
          state={modalState}
          onClose={() => setModalState(null)}
          onSave={handleSaveEntry}
        />
      ) : null}
      {logProgressOpen ? (
        <LogProgressModal entries={entries} onCommit={commitEntries} onClose={() => setLogProgressOpen(false)} />
      ) : null}
      {openFolderItem ? (
        <FolderModal
          item={openFolderItem}
          franchises={franchises}
          onCommitFranchises={(updated) => {
            commitFranchises(updated);
            const freshUnified = buildUnifiedLibraryItems(updated, entries);
            const found = freshUnified.find((u) => u.id === openFolderItem.id);
            if (found) setOpenFolderItem(found);
          }}
          onClose={() => setOpenFolderItem(null)}
          onOpenTracker={openTracker}
          onDetail={openInfo}
        />
      ) : null}
      {detailMedia ? (
        <DetailPanel
          key={`${detailMedia.id}-${detailMedia.type}`}
          media={detailMedia}
          loading={detailLoading}
          inLibrary={entryMap.has(mediaKey(detailMedia))}
          entryMap={entryMap}
          onClose={() => setDetailMedia(null)}
          onAdd={() => setModalState({ media: detailMedia, entry: entryMap.get(mediaKey(detailMedia)) })}
          onSelectRelated={openDetailById}
          onAddRelated={openAddById}
        />
      ) : null}
      <Toast toast={toastMessage} />
    </div>
  );
}
