"use client";

import { X } from "lucide-react";

type AxionDialogueProps = {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  reducedMotion?: boolean;
};

export function AxionDialogue({ message, visible, onDismiss, reducedMotion = false }: AxionDialogueProps) {
  if (!visible || !message) return null;

  return (
    <div className={`${reducedMotion ? "" : "axion-dialogue-enter"} axion-speech-bubble relative rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm`}>
      <button
        type="button"
        aria-label="Fechar mensagem"
        className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-muted"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="pr-6 text-sm leading-relaxed text-foreground">{message}</p>
    </div>
  );
}
