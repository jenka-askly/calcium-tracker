// Purpose: Provide JSON-backed persistence for entries and settings using AsyncStorage.
// Persists: Reads and writes AsyncStorage key calcium_tracker_v1 (entries + settings).
// Security Risks: Stores device identifiers and user-entered metadata in local storage.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { log } from "../utils/logger";

const STORAGE_KEY = "calcium_tracker_v1";
const SCHEMA_VERSION = 1;
const MAX_ENTRY_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type StoredEntry = {
  id: string;
  ts: string;
  [k: string]: any;
};

type StoredState = {
  schemaVersion: 1;
  entries: StoredEntry[];
  settings: Record<string, string>;
};

const defaultState: StoredState = {
  schemaVersion: SCHEMA_VERSION,
  entries: [],
  settings: {}
};

let cachedState: StoredState | null = null;
let loadPromise: Promise<StoredState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function sanitizeState(raw: unknown): StoredState {
  if (!raw || typeof raw !== "object") {
    return { ...defaultState };
  }
  const record = raw as Record<string, unknown>;
  const entries = Array.isArray(record.entries) ? record.entries : [];
  const settings = record.settings && typeof record.settings === "object" ? record.settings : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: entries.filter((entry) => entry && typeof entry === "object") as StoredEntry[],
    settings: settings as Record<string, string>
  };
}

function pruneEntries(
  entries: StoredEntry[],
  nowMs: number = Date.now()
): { entries: StoredEntry[]; prunedCount: number } {
  const cutoff = nowMs - MAX_ENTRY_AGE_MS;
  const kept: StoredEntry[] = [];
  let prunedCount = 0;
  for (const entry of entries) {
    const parsed = Date.parse(entry.ts);
    if (Number.isNaN(parsed) || parsed < cutoff) {
      prunedCount += 1;
    } else {
      kept.push(entry);
    }
  }
  return { entries: kept, prunedCount };
}

async function loadState(): Promise<StoredState> {
  if (cachedState) {
    return cachedState;
  }
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) {
          return { ...defaultState };
        }
        try {
          return sanitizeState(JSON.parse(stored));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log("db", "load:error", { message });
          return { ...defaultState };
        }
      })
      .then((state) => {
        cachedState = state;
        return state;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

async function persistState(state: StoredState): Promise<void> {
  const serialized = JSON.stringify(state);
  await AsyncStorage.setItem(STORAGE_KEY, serialized);
  cachedState = state;
}

function queueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function initDatabase(): Promise<void> {
  const state = await loadState();
  const { entries: prunedEntries, prunedCount } = pruneEntries(state.entries);
  const updatedState = prunedCount > 0 ? { ...state, entries: prunedEntries } : state;
  if (prunedCount > 0) {
    await queueWrite(async () => {
      await persistState(updatedState);
    });
  }
  log("db", "init", {
    entries_loaded: state.entries.length,
    entries_pruned: prunedCount,
    entries_final: updatedState.entries.length
  });
}

export async function getAllEntries(): Promise<StoredEntry[]> {
  const state = await loadState();
  return [...state.entries];
}

export async function addEntry(entry: Partial<StoredEntry>): Promise<StoredEntry> {
  const now = new Date();
  const created: StoredEntry = {
    ...entry,
    id: entry.id ?? `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    ts: entry.ts ?? now.toISOString()
  } as StoredEntry;

  await queueWrite(async () => {
    const state = await loadState();
    const { entries: prunedEntries } = pruneEntries([...state.entries, created]);
    await persistState({ ...state, entries: prunedEntries });
  });

  return created;
}

export async function updateEntry(id: string, patch: Partial<StoredEntry>): Promise<StoredEntry | null> {
  let updated: StoredEntry | null = null;
  await queueWrite(async () => {
    const state = await loadState();
    const nextEntries = state.entries.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }
      updated = { ...entry, ...patch, id: entry.id };
      return updated as StoredEntry;
    });
    const { entries: prunedEntries } = pruneEntries(nextEntries);
    await persistState({ ...state, entries: prunedEntries });
  });
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  await queueWrite(async () => {
    const state = await loadState();
    const remaining = state.entries.filter((entry) => entry.id !== id);
    const { entries: prunedEntries } = pruneEntries(remaining);
    await persistState({ ...state, entries: prunedEntries });
  });
}

export async function clearAll(): Promise<void> {
  await queueWrite(async () => {
    const state = await loadState();
    await persistState({ ...state, entries: [] });
  });
}

export async function getSettingValue(key: string): Promise<string | null> {
  const state = await loadState();
  return state.settings[key] ?? null;
}

export async function setSettingValue(key: string, value: string): Promise<void> {
  await queueWrite(async () => {
    const state = await loadState();
    const nextSettings = { ...state.settings, [key]: value };
    const { entries: prunedEntries } = pruneEntries(state.entries);
    await persistState({ ...state, entries: prunedEntries, settings: nextSettings });
  });
}

export { pruneEntries, type StoredEntry, type StoredState };
