/** A4 纸张尺寸（毫米） */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297

/** 页面在屏幕上的缩放比例 */
const PAGE_SCALE = 1

/** mm → px（按浏览器默认 96dpi，1mm ≈ 3.7795px），乘以缩放 */
export function mmToPx(mm: number): number {
  return mm * 3.7795 * PAGE_SCALE
}

function PageCanvas(): JSX.Element {
  return (
    <main className="canvas">
      <div className="a4-sheet" style={{ width: mmToPx(A4_WIDTH_MM), height: mmToPx(A4_HEIGHT_MM) }}>
        空白页（区块编辑将在后续版本提供）
      </div>
    </main>
  )
}

export default PageCanvas
