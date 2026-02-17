"use client";

import { apiRequest } from "@/lib/api/client";

const DB_NAME = "axiora_offline";
const STORE_NAME = "offline_queue";
const DB_VERSION = 1;

export type OfflineQueueType = "routine.mark" | "coach.use";

export type OfflineQueueItem = {
  id: string;
  type: OfflineQueueType;
  payload: Record<string, unknown>;
  createdAt: string;
};

type SyncBatchResponse = {
  processed: number;
  failed: Array<{ id: string; type: string; error: string }>;
};

let isFlushing = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueOfflineItem(type: OfflineQueueType, payload: Record<string, unknown>): Promise<string> {
  const db = await openDb();
  const item: OfflineQueueItem = {
    id: generateId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return item.id;
}

export function enqueueRoutineMark(payload: { child_id: number; task_id: number; date: string }): Promise<string> {
  return enqueueOfflineItem("routine.mark", payload);
}

export function enqueueCoachUse(payload: { child_id: number; mode: "CHILD" | "PARENT"; message?: string }): Promise<string> {
  return enqueueOfflineItem("coach.use", payload);
}

export async function listOfflineItems(): Promise<OfflineQueueItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const rows = (request.result as OfflineQueueItem[]).slice();
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removeOfflineItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOfflineQueue(): Promise<void> {
  if (isFlushing || !navigator.onLine) return;
  isFlushing = true;
  try {
    const items = await listOfflineItems();
    if (items.length === 0) return;

    const result = await apiRequest<SyncBatchResponse>("/sync/batch", {
      method: "POST",
      body: { items },
      requireAuth: true,
      includeTenant: true,
    });

    const failedIds = new Set(result.failed.map((item) => item.id));
    const processedIds = items.filter((item) => !failedIds.has(item.id)).map((item) => item.id);
    await removeOfflineItems(processedIds);
  } finally {
    isFlushing = false;
  }
}

export function startOfflineQueueSync(): () => void {
  const handleOnline = () => {
    void flushOfflineQueue();
  };
  window.addEventListener("online", handleOnline);
  void flushOfflineQueue();
  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
