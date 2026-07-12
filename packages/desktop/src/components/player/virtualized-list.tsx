import { useVirtualizer } from '@tanstack/react-virtual';
import type { CSSProperties, Key, ReactNode } from 'react';
import { useCallback, useRef } from 'react';

type VirtualizedListProps<T> = {
  className?: string;
  contentStyle?: CSSProperties;
  estimateSize: number;
  footer?: ReactNode;
  header?: ReactNode;
  items: readonly T[];
  keyExtractor: (item: T, index: number) => Key;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  style?: CSSProperties;
};

export function VirtualizedList<T>({
  className,
  contentStyle,
  estimateSize,
  footer,
  header,
  items,
  keyExtractor,
  overscan = 10,
  renderItem,
  style,
}: VirtualizedListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const getItemKey = useCallback(
    (index: number) => keyExtractor(items[index], index),
    [items, keyExtractor],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    getItemKey,
    getScrollElement: () => scrollRef.current,
    overscan,
  });

  return (
    <div
      ref={scrollRef}
      className={className ?? 'flex-1 min-h-0 overflow-y-auto'}
      style={style}
    >
      <div style={contentStyle}>
        {header}
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                left: 0,
                position: 'absolute',
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
              }}
            >
              {renderItem(items[virtualRow.index], virtualRow.index)}
            </div>
          ))}
        </div>
        {footer}
      </div>
    </div>
  );
}
