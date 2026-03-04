"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import type { MapSection } from "@/components/trail/ProgressionMap";
import { TrailScreen } from "@/components/trail/TrailScreen";

const AxioraCognitiveField = dynamic(() => import("@/components/ui/AxioraCognitiveField"), {
  ssr: false,
});

export default function LearningPathPage() {
  const progressionActiveNodeId = "fund-num-3";
  const progressionSections: MapSection[] = [
    {
      id: "fundamentos-numericos",
      title: "Fundamentos Numéricos",
      nodes: [
        {
          id: "fund-num-1",
          title: "Contagem e Sequências",
          subtitle: "Reconhecimento de padrões básicos",
          xp: 30,
          status: "done",
        },
        {
          id: "fund-num-2",
          title: "Comparação de Quantidades",
          subtitle: "Maior, menor e igualdade",
          xp: 30,
          status: "done",
        },
        {
          id: "fund-num-3",
          title: "Adição no Cotidiano",
          subtitle: "Resolver situações do dia a dia",
          xp: 30,
          status: "current",
        },
        {
          id: "fund-num-4",
          title: "Subtração com Estratégia",
          subtitle: "Decomposição e cálculo mental",
          xp: 30,
          status: "locked",
        },
        {
          id: "fund-num-checkpoint",
          title: "Marco: Estruturas Numéricas",
          subtitle: "Síntese dos fundamentos da seção",
          xp: 60,
          status: "locked",
          isCheckpoint: true,
        },
      ],
    },
  ];

  return (
    <>
      <AxioraCognitiveField />
      <div className="relative z-10 min-h-screen overflow-x-hidden bg-transparent">
        <Suspense fallback={null}>
          <TrailScreen progressionSections={progressionSections} progressionActiveNodeId={progressionActiveNodeId} />
        </Suspense>
      </div>
    </>
  );
}
