import Image from "next/image";

type MarketingBackgroundProps = {
  priority?: boolean;
};

export function MarketingBackground({ priority = false }: MarketingBackgroundProps) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <Image
          src="/axiora/auth/wallpaper.jpg"
          alt=""
          fill
          priority={priority}
          quality={60}
          sizes="100vw"
          className="object-cover object-[58%_center]"
        />
      </div>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgba(6,14,22,0.80)_0%,rgba(10,22,32,0.56)_50%,rgba(10,22,32,0.66)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.20),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.45),transparent_50%)]"
        aria-hidden="true"
      />
    </>
  );
}
