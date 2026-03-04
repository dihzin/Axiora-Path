import { useEffect } from "react";

export function useParallax() {
  useEffect(() => {
    let ticking = false;
    let nextX = 0;
    let nextY = 0;

    const applyMouseParallax = () => {
      document.querySelectorAll(".parallax-layer").forEach((el) => {
        const depth = Number((el as HTMLElement).dataset.depth || 1);
        (el as HTMLElement).style.transform = `translate(${nextX * depth}px, ${nextY * depth}px)`;
      });
      ticking = false;
    };

    const handleMove = (e: MouseEvent) => {
      nextX = (window.innerWidth / 2 - e.clientX) / 60;
      nextY = (window.innerHeight / 2 - e.clientY) / 60;

      if (!ticking) {
        window.requestAnimationFrame(applyMouseParallax);
        ticking = true;
      }
    };

    const handleScroll = () => {
      const offset = window.scrollY * 0.03;

      document
        .querySelectorAll(".layer-bg")
        .forEach((el) => ((el as HTMLElement).style.transform = `translateY(${offset}px)`));

      document
        .querySelectorAll(".layer-stars")
        .forEach((el) => ((el as HTMLElement).style.transform = `translateY(${offset * 2}px)`));
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
}
