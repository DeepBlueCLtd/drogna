// Planted violation: operational host-clock reads (Constitution I).
export const now = Date.now();
export const timer = setTimeout(() => undefined, 100);
