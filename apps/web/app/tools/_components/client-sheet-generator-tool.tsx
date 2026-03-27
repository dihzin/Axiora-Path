"use client";

import dynamic from "next/dynamic";

export const ClientSheetGeneratorTool = dynamic(
  () => import("@/components/tools/sheet-generator-tool").then((mod) => mod.SheetGeneratorTool),
  {
    ssr: false,
  },
);
