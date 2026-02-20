"use client";

type ChildAvatarProps = {
  name: string;
  avatarKey?: string | null;
  size?: number;
  className?: string;
};

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "A";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function ChildAvatar({ name, avatarKey, size = 44, className = "" }: ChildAvatarProps) {
  const initials = getInitials(name);
  const hasPhoto = Boolean(avatarKey && avatarKey.startsWith("data:image/"));

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full border border-[#BFD3EE] bg-white shadow-[0_4px_10px_rgba(50,90,140,0.2)] ${className}`}
      style={{ width: size, height: size }}
      aria-label={`Avatar de ${name}`}
    >
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`Foto de ${name}`} className="h-full w-full object-cover" src={avatarKey ?? undefined} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#8EF1E2,#3ECBB8_55%,#2A8F95)] text-white">
          <span className="text-[11px] font-black tracking-wide" style={{ lineHeight: 1 }}>{initials}</span>
          <span className="mt-0.5 text-[10px]" style={{ lineHeight: 1 }}>🙂</span>
        </div>
      )}
    </div>
  );
}
