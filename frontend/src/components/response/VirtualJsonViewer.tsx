import { useEffect, useMemo, useRef, useState } from 'react';
import { buildVisibleRows, type JsonValue } from './jsonTree';

const ROW_HEIGHT = 22;
const OVERSCAN = 20;

export const VirtualJsonViewer = ({ data }: { data: JsonValue }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['$']));
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setExpanded(new Set(['$']));
    setScrollTop(0);
  }, [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resize = () => setViewportHeight(el.clientHeight || 500);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => buildVisibleRows(data, expanded), [data, expanded]);
  const totalHeight = rows.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(rows.length, start + visibleCount);
  const y = start * ROW_HEIGHT;
  const visibleRows = rows.slice(start, end);

  const toggleRow = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto font-mono text-xs border border-border rounded bg-muted/20"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: y, left: 0, right: 0 }}>
          {visibleRows.map((row) => (
            <div
              key={row.path}
              className="flex items-center gap-1 px-2 hover:bg-muted/40"
              style={{ height: ROW_HEIGHT, paddingLeft: `${row.depth * 14 + 8}px` }}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  className="w-4 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleRow(row.path)}
                >
                  {row.isExpanded ? '▾' : '▸'}
                </button>
              ) : (
                <span className="w-4 text-muted-foreground"> </span>
              )}
              {row.key !== null && <span className="text-sky-700">{row.key}:</span>}
              <span
                className={
                  row.kind === 'primitive'
                    ? 'text-foreground'
                    : row.kind === 'array'
                      ? 'text-emerald-700'
                      : 'text-violet-700'
                }
              >
                {row.preview}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
