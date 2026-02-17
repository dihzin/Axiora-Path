"use client";

import { useEffect } from "react";

import { startOfflineQueueSync } from "@/lib/offline-queue";

export function OfflineSyncBootstrap() {
  useEffect(() => {
    return startOfflineQueueSync();
  }, []);

  return null;
}

