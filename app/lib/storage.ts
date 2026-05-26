import type { MediaType } from "./jikan";

export type OkamiStatus = "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";

export type OkamiEntry = {
  id: number;
  type: MediaType;
  title: string;
  cover: string;
  year: number;
  format: string;
  genres: string[];
  official_score: number;
  user_score: number | null;
  status: OkamiStatus;
  progress: number;
  total: number | null;
  completed_seasons?: number[];
  completed_volumes?: number[];
  completed_episodes?: number[];
  date_added: string;
  notes: string;
  is_favourite: boolean;
};

const STORAGE_KEY = "okami_entries";

export function loadEntries(): OkamiEntry[] {
  return readEntries();
}

export function readEntries(): OkamiEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OkamiEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: OkamiEntry[]): void {
  writeEntries(entries);
}

export function writeEntries(entries: OkamiEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  const exists = entries.some((existing) => existing.id === entry.id && existing.type === entry.type);
  if (exists) return entries;
  return [...entries, { ...entry, date_added: new Date().toISOString() }];
}

export function upsertEntry(entries: OkamiEntry[], entry: OkamiEntry): OkamiEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id && existing.type === entry.type);
  if (index === -1) return [entry, ...entries];
  const next = [...entries];
  next[index] = entry;
  return next;
}

export function updateEntry(
  entries: OkamiEntry[],
  id: number,
  type: MediaType,
  patch: Partial<OkamiEntry>
): OkamiEntry[] {
  return entries.map((entry) =>
    entry.id === id && entry.type === type ? { ...entry, ...patch } : entry
  );
}

export function removeEntry(entries: OkamiEntry[], id: number, type: MediaType): OkamiEntry[] {
  return entries.filter((entry) => !(entry.id === id && entry.type === type));
}

export function toggleFavourite(entries: OkamiEntry[], id: number, type: MediaType): OkamiEntry[] {
  return entries.map((entry) =>
    entry.id === id && entry.type === type
      ? { ...entry, is_favourite: !entry.is_favourite }
      : entry
  );
}
