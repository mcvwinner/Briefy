/** mm → px（浏览器默认 96dpi：1mm ≈ 3.7795px） */
export function mmToPx(mm: number): number {
  return mm * 3.7795
}

/** px → mm */
export function pxToMm(px: number): number {
  return px / 3.7795
}
