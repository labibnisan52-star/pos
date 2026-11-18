/**
 * Shared stacking order across POS overlays:
 * page < stickyBar < backdrop < bottomSheet < scannerOverlay < scanMiniCart < toast
 */
export const Z_INDEX = {
  stickyBar: 30,
  backdrop: 40,
  bottomSheet: 50,
  scannerOverlay: 70,
  scanMiniCart: 90,
  toast: 9999,
} as const;

