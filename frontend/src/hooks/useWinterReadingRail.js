import { useLayoutEffect, useRef } from "react";
import { ACTIVE_SEASON } from "../config/season.js";

// Size the illustration for the available space below the tracker.
export function useWinterReadingRail(isLoggedIn) {
  const railRef = useRef(null);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (ACTIVE_SEASON !== "winter" || !rail) return;

    // Signing in replaces the sign-in card with the tracker.
    const card = rail.firstElementChild;
    const nav = document.querySelector(".site-nav");
    const dock = document.querySelector(".tales-dock");
    const gutter = 12;
    function measure() {
      const pinnedNav = nav && ["sticky", "fixed"].includes(getComputedStyle(nav).position);
      const top = (pinnedNav ? nav.offsetHeight : 0) + gutter;
      const treeSpace = document.documentElement.clientHeight - top - (dock?.offsetHeight ?? 0)
        - gutter - card.offsetHeight - parseFloat(getComputedStyle(rail).rowGap);
      rail.style.setProperty("--tree-space", `${Math.floor(treeSpace)}px`);
      rail.toggleAttribute("data-fits-viewport", treeSpace >= 144);
    }

    const observer = new ResizeObserver(measure);
    for (const element of [card, nav, dock]) {
      if (element) observer.observe(element);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isLoggedIn]);

  return railRef;
}
