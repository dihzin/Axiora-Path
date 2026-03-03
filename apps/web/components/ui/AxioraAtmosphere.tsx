"use client";

const ATMOSPHERE_PARTICLES = [
  { left: "6%", top: "8%", size: 6, delay: "0s", duration: "6.2s", drift: "a", driftDuration: "18s" },
  { left: "12%", top: "16%", size: 7, delay: "0.5s", duration: "6.8s", drift: "b", driftDuration: "21s" },
  { left: "19%", top: "9%", size: 6, delay: "0.9s", duration: "7.1s", drift: "c", driftDuration: "20s" },
  { left: "26%", top: "20%", size: 8, delay: "1.4s", duration: "7.4s", drift: "a", driftDuration: "24s" },
  { left: "34%", top: "12%", size: 6, delay: "1.9s", duration: "6.9s", drift: "b", driftDuration: "19s" },
  { left: "42%", top: "18%", size: 7, delay: "2.4s", duration: "7.2s", drift: "c", driftDuration: "22s" },
  { left: "50%", top: "10%", size: 6, delay: "2.9s", duration: "6.7s", drift: "a", driftDuration: "25s" },
  { left: "58%", top: "15%", size: 8, delay: "3.4s", duration: "7.6s", drift: "b", driftDuration: "20s" },
  { left: "65%", top: "11%", size: 6, delay: "3.8s", duration: "7.0s", drift: "c", driftDuration: "23s" },
  { left: "72%", top: "19%", size: 7, delay: "4.3s", duration: "6.5s", drift: "a", driftDuration: "18s" },
  { left: "79%", top: "13%", size: 6, delay: "4.8s", duration: "7.3s", drift: "b", driftDuration: "21s" },
  { left: "86%", top: "22%", size: 8, delay: "5.2s", duration: "6.9s", drift: "c", driftDuration: "24s" },
  { left: "91%", top: "9%", size: 6, delay: "5.7s", duration: "7.2s", drift: "a", driftDuration: "19s" },
  { left: "95%", top: "17%", size: 7, delay: "6.1s", duration: "6.8s", drift: "b", driftDuration: "22s" },
  { left: "9%", top: "34%", size: 6, delay: "0.7s", duration: "7.0s", drift: "c", driftDuration: "20s" },
  { left: "22%", top: "41%", size: 7, delay: "1.5s", duration: "6.6s", drift: "a", driftDuration: "23s" },
  { left: "37%", top: "48%", size: 6, delay: "2.2s", duration: "7.5s", drift: "b", driftDuration: "19s" },
  { left: "53%", top: "38%", size: 8, delay: "3.1s", duration: "7.2s", drift: "c", driftDuration: "25s" },
  { left: "69%", top: "46%", size: 6, delay: "4.1s", duration: "6.8s", drift: "a", driftDuration: "21s" },
  { left: "84%", top: "36%", size: 7, delay: "5.0s", duration: "7.4s", drift: "b", driftDuration: "24s" },
  { left: "15%", top: "58%", size: 6, delay: "0.4s", duration: "6.9s", drift: "c", driftDuration: "20s" },
  { left: "31%", top: "66%", size: 8, delay: "1.7s", duration: "7.1s", drift: "a", driftDuration: "22s" },
  { left: "47%", top: "74%", size: 6, delay: "2.8s", duration: "6.7s", drift: "b", driftDuration: "18s" },
  { left: "63%", top: "62%", size: 7, delay: "3.6s", duration: "7.6s", drift: "c", driftDuration: "23s" },
  { left: "78%", top: "71%", size: 6, delay: "4.4s", duration: "7.0s", drift: "a", driftDuration: "24s" },
  { left: "90%", top: "57%", size: 7, delay: "5.6s", duration: "6.8s", drift: "b", driftDuration: "20s" },
  { left: "11%", top: "86%", size: 6, delay: "1.0s", duration: "7.3s", drift: "c", driftDuration: "21s" },
  { left: "28%", top: "91%", size: 7, delay: "2.0s", duration: "6.9s", drift: "a", driftDuration: "25s" },
  { left: "44%", top: "84%", size: 6, delay: "3.0s", duration: "7.4s", drift: "b", driftDuration: "19s" },
  { left: "61%", top: "93%", size: 8, delay: "4.2s", duration: "7.1s", drift: "c", driftDuration: "22s" },
  { left: "77%", top: "87%", size: 6, delay: "5.2s", duration: "6.7s", drift: "a", driftDuration: "18s" },
  { left: "92%", top: "95%", size: 7, delay: "6.0s", duration: "7.5s", drift: "b", driftDuration: "24s" },
] as const;

export default function AxioraAtmosphere() {
  return (
    <div
      aria-hidden
      data-axiora-atmosphere-root
      data-axiora-atmosphere="root"
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
    >
      <div
        aria-hidden
        data-axiora-atmosphere="base"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, rgba(255,107,61,0.18) 0%, transparent 45%), radial-gradient(circle at 80% 75%, rgba(255,140,100,0.15) 0%, transparent 50%)",
        }}
      />
      <div
        aria-hidden
        data-axiora-atmosphere="core"
        className="absolute left-1/2 top-[10%] h-[800px] w-[800px] -translate-x-1/2 rounded-full opacity-35 blur-[140px]"
        style={{
          background:
            "radial-gradient(circle, rgba(255,107,61,0.45) 0%, rgba(255,107,61,0.25) 25%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        data-axiora-atmosphere="noise"
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage: "url('/textures/axiora-noise.png')",
          backgroundSize: "300px 300px",
        }}
      />
      <div
        aria-hidden
        data-axiora-atmosphere="particles"
        className="absolute inset-0 overflow-hidden"
      >
        {ATMOSPHERE_PARTICLES.map((particle, index) => (
          <span
            key={`axiora-particle-${index}`}
            className="absolute will-change-transform"
            style={{
              left: particle.left,
              top: particle.top,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animation: `axiora-galaxy-drift-${particle.drift} ${particle.driftDuration} ease-in-out ${particle.delay} infinite`,
            }}
          >
            <span
              className="block h-full w-full rounded-full bg-[#FF6B3D] opacity-[0.34] will-change-transform"
              style={{
                boxShadow: "0 0 10px rgba(255,107,61,0.32)",
                animation: `axiora-breathing ${particle.duration} ease-in-out ${particle.delay} infinite`,
              }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
