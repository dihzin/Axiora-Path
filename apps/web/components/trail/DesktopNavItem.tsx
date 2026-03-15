import Link from "next/link";

import { ChildNavIcon, type ChildNavIconKey } from "@/components/child-bottom-nav";

type DesktopNavItemProps = {
  href: string;
  iconName: ChildNavIconKey;
  label: string;
  active: boolean;
};

export function DesktopNavItem({ href, iconName, label, active }: DesktopNavItemProps) {
  return (
    <Link
      href={href}
      className={`mx-1.5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-[7px] text-[15px] font-semibold uppercase tracking-[0.04em] text-slate-200/85 transition-all duration-200 ${
        active
          ? "border-l-[3px] border-l-orange-400/90 bg-white/5 text-slate-100/90"
          : "text-slate-300/80 hover:bg-white/5 hover:text-slate-100/90"
      }`}
    >
      <span className="opacity-85 grayscale-[80%]">
        <ChildNavIcon name={iconName} active={active} size={42} />
      </span>
      {label}
    </Link>
  );
}
