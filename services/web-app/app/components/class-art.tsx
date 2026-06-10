import { useMemo } from 'react';
import {
  CLASS_ART_HEIGHT,
  CLASS_ART_WIDTH,
  generateClassArt,
} from '~/utils/class-art';
import { cn } from '~/utils/misc';

export function ClassArt({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const spec = useMemo(() => generateClassArt(seed), [seed]);

  return (
    <svg
      data-testid="class-art"
      aria-hidden="true"
      viewBox={`0 0 ${CLASS_ART_WIDTH} ${CLASS_ART_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('block h-full w-full', className)}
    >
      <rect
        width={CLASS_ART_WIDTH}
        height={CLASS_ART_HEIGHT}
        fill={spec.background}
      />
      {spec.elements.map((element, index) => {
        switch (element.kind) {
          case 'rect':
            return (
              <rect
                key={index}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                fill={element.fill}
              />
            );
          case 'line':
            return (
              <line
                key={index}
                x1={element.x1}
                y1={element.y1}
                x2={element.x2}
                y2={element.y2}
                stroke={element.stroke}
                strokeWidth={element.strokeWidth}
                strokeLinecap="square"
              />
            );
          case 'glyph':
            return (
              <text
                key={index}
                x={element.x}
                y={element.y}
                fill={element.fill}
                fontSize={element.fontSize}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {element.text}
              </text>
            );
          case 'polyline':
            return (
              <polyline
                key={index}
                points={element.points
                  .map(([x, y]) => `${x},${y}`)
                  .join(' ')}
                fill="none"
                stroke={element.stroke}
                strokeWidth={element.strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          default:
            return null;
        }
      })}
    </svg>
  );
}
