function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = start;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Smooth scroll til toppen af lead-arbejdsvisningen.
 * Bruger nærmeste scroll-container fra `anchor`, ellers window.
 */
export function scrollWorkspaceToTop(anchor?: HTMLElement | null) {
  if (typeof window === "undefined") return;

  const scrollable = findScrollableAncestor(anchor ?? document.body);
  if (scrollable && scrollable !== document.documentElement && scrollable !== document.body) {
    scrollable.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}
