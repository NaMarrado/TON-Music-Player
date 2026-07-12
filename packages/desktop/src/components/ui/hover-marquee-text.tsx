import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

const MARQUEE_SPEED_PX_PER_SECOND = 32;
const MARQUEE_END_DELAY_SECONDS = 1;

type MarqueeMotion = {
  durationMilliseconds: number;
  movementEndOffset: number;
  offset: string;
};

export function HoverMarqueeText({
  className = '',
  style,
  text,
}: {
  className?: string;
  style?: CSSProperties;
  text: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const usesRowHitboxRef = useRef(false);
  const [motion, setMotion] = useState<MarqueeMotion | null>(null);

  const startMarquee = useCallback(() => {
    const container = containerRef.current;
    const content = textRef.current;
    if (!container || !content) return;

    const distance = Math.ceil(content.scrollWidth - container.clientWidth);
    if (distance <= 1) {
      setMotion(null);
      return;
    }

    const movementDurationSeconds = distance / MARQUEE_SPEED_PX_PER_SECOND;
    const durationSeconds = movementDurationSeconds + MARQUEE_END_DELAY_SECONDS;

    setMotion({
      durationMilliseconds: durationSeconds * 1000,
      movementEndOffset: movementDurationSeconds / durationSeconds,
      offset: `-${distance}px`,
    });
  }, []);

  const stopMarquee = useCallback(() => setMotion(null), []);

  useEffect(() => {
    const container = containerRef.current;
    const row = container?.closest<HTMLElement>('.track-row');
    usesRowHitboxRef.current = Boolean(row);
    if (!container || !row) return undefined;

    let isInsideColumn = false;
    const handleRowMouseMove = (event: MouseEvent) => {
      const bounds = container.getBoundingClientRect();
      const nextIsInside = event.clientX >= bounds.left && event.clientX <= bounds.right;
      if (nextIsInside === isInsideColumn) return;

      isInsideColumn = nextIsInside;
      if (nextIsInside) {
        startMarquee();
      } else {
        stopMarquee();
      }
    };
    const handleRowMouseLeave = () => {
      isInsideColumn = false;
      stopMarquee();
    };

    row.addEventListener('mousemove', handleRowMouseMove);
    row.addEventListener('mouseleave', handleRowMouseLeave);
    return () => {
      row.removeEventListener('mousemove', handleRowMouseMove);
      row.removeEventListener('mouseleave', handleRowMouseLeave);
      usesRowHitboxRef.current = false;
    };
  }, [startMarquee, stopMarquee]);

  useEffect(() => {
    const content = textRef.current;
    if (!content || !motion) return undefined;

    const endTransform = `translate3d(${motion.offset}, 0, 0)`;
    const animation = content.animate(
      [
        { offset: 0, transform: 'translate3d(0, 0, 0)' },
        { offset: motion.movementEndOffset, transform: endTransform },
        { offset: 1, transform: endTransform },
      ],
      {
        duration: motion.durationMilliseconds,
        easing: 'linear',
        iterations: Infinity,
      },
    );

    return () => animation.cancel();
  }, [motion]);

  return (
    <div
      ref={containerRef}
      className={`ton-hover-marquee ${className}`}
      data-running={motion ? 'true' : 'false'}
      style={style}
      title={text}
      onMouseEnter={() => {
        if (!usesRowHitboxRef.current) startMarquee();
      }}
      onMouseLeave={() => {
        if (!usesRowHitboxRef.current) stopMarquee();
      }}
    >
      <span ref={textRef} className="ton-hover-marquee-text" dir="auto">
        {text}
      </span>
    </div>
  );
}
