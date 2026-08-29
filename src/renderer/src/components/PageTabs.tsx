import type * as React from 'react'
import { makeStyles, Text, tokens, Tooltip } from '@fluentui/react-components'
import { DocumentRegular, DeleteRegular, AddRegular, ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons'
import type { Page } from '../../../shared/layout'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: tokens.borderRadiusMedium,
    background: 'transparent',
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase300
  },
  tabActive: {
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2
  }
})

interface PageTabsProps {
  pages: Page[]
  currentPageId: string
  onSelect: (pageId: string) => void
  onAdd: () => void
  onRemove: (pageId: string) => void
  /** 调整页面顺序（dir -1 = 前移，1 = 后移） */
  onMove: (pageId: string, dir: -1 | 1) => void
}

/** 底部页签栏：Word 式多页管理（当前页签可前后移动调序） */
function PageTabs({ pages, currentPageId, onSelect, onAdd, onRemove, onMove }: PageTabsProps): React.JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.bar}>
      {pages.map((page, i) => (
        <button
          key={page.id}
          type="button"
          className={`${styles.tab} ${page.id === currentPageId ? styles.tabActive : ''}`}
          onClick={() => onSelect(page.id)}
        >
          <DocumentRegular />
          <Text size={200}>第 {i + 1} 页 · {page.slots.length} 格</Text>
          {page.id === currentPageId && pages.length > 1 && (
            <>
              <span
                role="button"
                aria-label={`第 ${i + 1} 页前移`}
                style={{ opacity: i > 0 ? 1 : 0.3, display: 'inline-flex' }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (i > 0) onMove(page.id, -1)
                }}
              >
                <ChevronLeftRegular fontSize={12} />
              </span>
              <span
                role="button"
                aria-label={`第 ${i + 1} 页后移`}
                style={{ opacity: i < pages.length - 1 ? 1 : 0.3, display: 'inline-flex' }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (i < pages.length - 1) onMove(page.id, 1)
                }}
              >
                <ChevronRightRegular fontSize={12} />
              </span>
            </>
          )}
          {pages.length > 1 && (
            <span
              role="button"
              aria-label={`删除第 ${i + 1} 页`}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(page.id)
              }}
            >
              <DeleteRegular fontSize={12} />
            </span>
          )}
        </button>
      ))}
      <Tooltip content="添加新页" relationship="description">
        <button type="button" className={styles.iconBtn} onClick={onAdd} aria-label="添加新页">
          <AddRegular />
        </button>
      </Tooltip>
    </div>
  )
}

export default PageTabs
