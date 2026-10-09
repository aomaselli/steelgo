import { useEffect, useRef, useState } from "react";

/** Width of the element the homepage is rendered in (not window.innerWidth). */
export function useElementWidth<T extends HTMLElement>(initial = 1280) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w) setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
