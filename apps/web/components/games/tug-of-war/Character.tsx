"use client";

import BlueCharacter from "@/assets/svg/games/tug-of-war/blue_character.svg";
import RedCharacter from "@/assets/svg/games/tug-of-war/red_character.svg";

import styles from "./Character.module.css";

export type CharacterAnim = "idle" | "pull" | "hit" | "victory" | "defeat";
const WIN_THRESHOLD = 130;

export const HAND_OFFSET = {
  // Offset from character left/top in scene coordinates, calibrated to rope tip in each sprite.
  red: { x: 216, y: 62 },
  blue: { x: 132, y: 62 },
} as const;

type CharacterProps = {
  side: "red" | "blue";
  x: number;
  anim: CharacterAnim;
  tension: number;
};

export function Character({ side, x, anim, tension }: CharacterProps) {
  const sweating = Math.abs(x) > WIN_THRESHOLD * 0.7;
  const struggling = tension > 0.6 && anim === "idle";
  const className = [
    styles["tow-character"],
    styles[side],
    styles[anim],
    struggling ? styles.struggling : "",
    sweating ? styles.sweating : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{
        left: side === "red" ? `calc(6% + ${x}px)` : undefined,
        right: side === "blue" ? `calc(6% - ${x}px)` : undefined,
        ["--tension" as string]: `${Math.min(1, Math.max(0, tension))}`,
      }}
      aria-label={`${side} character`}
    >
      <div className={styles.characterRoot}>
        <div className={styles.characterBody}>
          {sweating ? <div className={styles.sweat} /> : null}
          <div className={styles.characterSprite}>{side === "red" ? <RedCharacter /> : <BlueCharacter />}</div>
          <div className={styles.arms} aria-hidden>
            <span className={`${styles.arm} ${styles.left}`} />
            <span className={`${styles.arm} ${styles.right}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
