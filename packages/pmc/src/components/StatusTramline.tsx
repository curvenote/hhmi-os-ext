import { useRef, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatDatetime } from '@curvenote/scms-core';

const COLOR_MAP = {
  default: {
    filled: '#60a5fa', // blue-400, softer
    outlined: '#dbeafe', // blue-50, more subtle
    borderLight: '#a3bffa', // blue-300, gentler
    lineFilled: '#60a5fa',
    lineUnfilled: '#e5e7eb', // gray-200
    text: 'text-blue-500',
  },
  success: {
    filled: '#34d399', // emerald-400, softer
    outlined: '#d1fae5', // emerald-50, more subtle
    borderLight: '#6ee7b7', // emerald-300, gentler
    lineFilled: '#34d399',
    lineUnfilled: '#d1fae5',
    text: 'text-green-600',
  },
  warning: {
    filled: '#fef3c7', // amber-50, warmer
    outlined: '#fef3c7', // amber-50
    borderLight: '#fde68a', // amber-200
    lineFilled: '#fbbf24', // amber-400, softer
    lineUnfilled: '#fef3c7',
    text: 'text-yellow-700',
    bg: '#fef3c7', // pale amber
    border: '#a16207', // yellow-700
    icon: '#a16207', // yellow-700
  },
  error: {
    filled: '#f87171', // red-400, less harsh
    outlined: '#fecaca', // red-100, softer
    borderLight: '#fca5a5', // red-300
    lineFilled: '#f87171',
    lineUnfilled: '#fecaca',
    text: 'text-red-600',
    bg: '#fecaca', // pale red
    border: '#f87171', // red-400
    icon: '#f87171', // red-400
  },
  grey: {
    fill: '#f3f4f6', // gray-100, lighter
    stroke: '#e5e7eb', // gray-200, softer
  },
};

export type TramStopColors = 'default' | 'success' | 'warning' | 'error';

export interface TramStop {
  title: string;
  subtitle?: string;
  status: string;
  completed: boolean;
  error: boolean;
  warning: boolean;
}

interface StatusTramlineProps {
  stops: TramStop[];
  ended?: boolean;
  color?: TramStopColors;
  currentColor?: TramStopColors;
  labelGap?: number; // px
  sidePadding?: number; // px
  subtitlePadding?: number; // px
  lookahead?: boolean;
  message?: React.ReactNode;
}

const NODE_RADIUS = 16;
const LINE_THICKNESS = 4;
const MAX_LABEL_WIDTH = 180;

// Helper function to format subtitle dates
function formatSubtitle(subtitle?: string): string {
  if (!subtitle) return '\u00A0'; // Non-breaking space if no subtitle
  return formatDatetime(subtitle, 'MMM dd, y HH:mm');
}

export function StatusTramline({
  stops,
  ended = false,
  color = 'default',
  currentColor,
  labelGap = 22,
  sidePadding = 24,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subtitlePadding = 12,
  lookahead = false,
  message,
}: StatusTramlineProps) {
  const n = stops.length;

  // Find the last completed stop index
  const lastCompletedIndex = stops.reduce((lastIndex, stop, index) => {
    return stop.completed ? index : lastIndex;
  }, -1);

  // Responsive container width — measure via ResizeObserver so we pick up
  // layout that settles after first paint (sidebar, fonts, async content).
  // A one-shot offsetWidth + window resize misses that and can leave the
  // centered SVG wider than its card until the next navigation/refresh.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const width = el.offsetWidth;
      if (width > 0) setContainerWidth(width);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate label area width and node positions
  const availableWidth = Math.max(containerWidth - 2 * sidePadding - (n - 1) * labelGap, 0);
  const labelAreaWidth = Math.min(n > 0 ? availableWidth / n : 0, MAX_LABEL_WIDTH);
  const totalLabelsWidth = n * labelAreaWidth + (n - 1) * labelGap;
  const startX = (containerWidth - totalLabelsWidth) / 2 + labelAreaWidth / 2;
  // Node x positions (center of each label area)
  const nodeXs = stops.map((_, idx) => startX + idx * (labelAreaWidth + labelGap));
  // SVG width is always containerWidth
  const svgWidth = containerWidth;

  // Helper to resolve color for a stop based on boolean flags
  function resolveColor(stop: TramStop): TramStopColors {
    // Check if workflow ended successfully (ended=true and last completed stop has ok tag)
    const lastCompletedStop = stops[lastCompletedIndex];
    const workflowEndedSuccessfully =
      ended && lastCompletedStop && !lastCompletedStop.error && !lastCompletedStop.warning;

    // If workflow ended successfully and this is a completed stop, use success color
    // unless the stop itself has error or warning tags
    if (workflowEndedSuccessfully && stop.completed) {
      if (stop.error) return 'error';
      if (stop.warning) return 'warning';
      return 'success';
    }

    if (stop.error) return 'error';
    if (stop.warning) return 'warning';
    // Otherwise fall back to the default color
    return color || 'default';
  }

  // For lines, use the color prop if set, otherwise the resolved color for each segment
  function getLineColor(idx: number, filled: boolean, isLookahead: boolean) {
    // Check if workflow ended successfully for line segments
    const lastCompletedStop = stops[lastCompletedIndex];
    const workflowEndedSuccessfully =
      ended && lastCompletedStop && !lastCompletedStop.error && !lastCompletedStop.warning;

    // If workflow ended successfully and this line segment connects completed stops, use success color
    if (workflowEndedSuccessfully && filled) {
      const cmap = COLOR_MAP.success;
      return cmap.lineFilled;
    }

    if (color) {
      const cmap = COLOR_MAP[color];
      if (isLookahead && lookahead) return cmap.lineFilled;
      return filled ? cmap.lineFilled : cmap.lineUnfilled;
    }

    const stopColor = resolveColor(stops[idx]);
    const cmap = COLOR_MAP[stopColor];
    if (isLookahead && lookahead) return cmap.lineFilled;
    return filled ? cmap.lineFilled : cmap.lineUnfilled;
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center w-full overflow-hidden py-6 bg-white border rounded-sm"
      style={{ minHeight: 180 }}
    >
      {containerWidth > 0 && (
        <>
          {/* Title row - ABOVE the tram line */}
          <div style={{ width: '100%', padding: `0 ${sidePadding}px`, marginBottom: 8 }}>
            <div className="flex items-end justify-center" style={{ gap: labelGap }}>
              {stops.map((stop, idx) => {
                const shouldBeGreyedOut = ended && idx > lastCompletedIndex;

                return (
                  <div
                    key={stop.status + '-title'}
                    style={{
                      width: labelAreaWidth,
                      maxWidth: MAX_LABEL_WIDTH,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      className={`text-sm ${!stop.completed ? 'font-medium' : 'font-bold'} leading-tight text-center break-words`}
                      style={{
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        color: shouldBeGreyedOut ? COLOR_MAP.grey.stroke : undefined,
                      }}
                    >
                      {stop.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SVG Tramline */}
          <svg
            width={svgWidth}
            height={2 * NODE_RADIUS + 8}
            viewBox={`0 0 ${svgWidth} ${2 * NODE_RADIUS + 8}`}
            className="block max-w-full"
            aria-label="Submission status tramline"
            style={{ zIndex: 1, display: 'block' }}
          >
            {/* Define gradients for modern look */}
            <defs>
              <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="greenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="defaultGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="warningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="errorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            {/* Tramline background (unfilled) */}
            {n > 1 && (
              <>
                {/* Draw each segment with its resolved color */}
                {stops.slice(0, n - 1).map((_, idx) => {
                  const filled = idx < lastCompletedIndex;
                  const isLookahead = lookahead && idx === lastCompletedIndex;
                  const colorForLine = getLineColor(idx, filled, isLookahead);
                  return (
                    <line
                      key={stops[idx].status + '-line'}
                      x1={nodeXs[idx]}
                      y1={(2 * NODE_RADIUS + 8) / 2}
                      x2={nodeXs[idx + 1]}
                      y2={(2 * NODE_RADIUS + 8) / 2}
                      stroke={colorForLine}
                      strokeWidth={LINE_THICKNESS}
                      strokeLinecap="round"
                    />
                  );
                })}
              </>
            )}
            {/* Nodes */}
            {stops.map((stop, idx) => {
              const isCurrent = idx === lastCompletedIndex;
              const colorKey = isCurrent && currentColor ? currentColor : resolveColor(stop);
              const isFilled = stop.completed;
              const cx = nodeXs[idx];

              // Check if this dot should be greyed out (after last completed stop when workflow is ended)
              const shouldBeGreyedOut = ended && idx > lastCompletedIndex;

              // Greyed out logic for ended workflow - check this FIRST
              if (shouldBeGreyedOut) {
                const greyFill = COLOR_MAP.grey.fill;
                const greyStroke = COLOR_MAP.grey.stroke;
                return (
                  <circle
                    key={stop.status}
                    cx={cx}
                    cy={(2 * NODE_RADIUS + 8) / 2}
                    r={NODE_RADIUS}
                    fill={greyFill}
                    stroke={greyStroke}
                    strokeWidth={2}
                    aria-label="Greyed out"
                  />
                );
              }

              // Special behavior when color prop is set (but only if we don't have a specific resolved color)
              if (color !== undefined && colorKey === color && !(isCurrent && currentColor)) {
                const cmap = COLOR_MAP[color];
                if (isFilled) {
                  // Completed: filled with gradient and shadow
                  return (
                    <circle
                      key={stop.status}
                      cx={cx}
                      cy={(2 * NODE_RADIUS + 8) / 2}
                      r={NODE_RADIUS}
                      fill="url(#blueGradient)"
                      stroke={cmap.filled}
                      strokeWidth={0}
                      filter="drop-shadow(0 1px 2px rgba(0,0,0,0.1))"
                      aria-label={color.charAt(0).toUpperCase() + color.slice(1)}
                    />
                  );
                } else {
                  // Uncompleted: pale bg, borderLight
                  return (
                    <circle
                      key={stop.status}
                      cx={cx}
                      cy={(2 * NODE_RADIUS + 8) / 2}
                      r={NODE_RADIUS}
                      fill={'bg' in cmap ? (cmap as any).bg : cmap.outlined}
                      stroke={cmap.borderLight}
                      strokeWidth={2}
                      aria-label={color.charAt(0).toUpperCase() + color.slice(1)}
                    />
                  );
                }
              }

              // Explicit color logic (icon for warning/error, green for success, etc)
              if (colorKey === 'warning' || colorKey === 'error') {
                const colorSpec = COLOR_MAP[colorKey];
                return (
                  <g key={stop.status}>
                    <circle
                      cx={cx}
                      cy={(2 * NODE_RADIUS + 8) / 2}
                      r={NODE_RADIUS}
                      fill={colorSpec.filled}
                      stroke={colorSpec.border}
                      strokeWidth={2}
                      aria-label={colorKey === 'warning' ? 'Warning' : 'Error'}
                    />
                    <foreignObject
                      x={cx - NODE_RADIUS}
                      y={(2 * NODE_RADIUS + 8) / 2 - NODE_RADIUS - 1}
                      width={NODE_RADIUS * 2}
                      height={NODE_RADIUS * 2}
                      pointerEvents="none"
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AlertTriangle
                          size={20}
                          color={colorSpec.icon}
                          strokeWidth={2}
                          aria-label={colorKey === 'warning' ? 'Warning' : 'Error'}
                        />
                      </div>
                    </foreignObject>
                  </g>
                );
              }
              if (colorKey === 'success') {
                const colorSpec = COLOR_MAP.success;
                return (
                  <circle
                    key={stop.status}
                    cx={cx}
                    cy={(2 * NODE_RADIUS + 8) / 2}
                    r={NODE_RADIUS}
                    fill="url(#greenGradient)"
                    stroke={colorSpec.filled}
                    strokeWidth={0}
                    filter="drop-shadow(0 1px 2px rgba(0,0,0,0.1))"
                    aria-label="Success"
                  />
                );
              }

              // Default node
              const cmap = COLOR_MAP[colorKey];
              return (
                <circle
                  key={stop.status}
                  cx={cx}
                  cy={(2 * NODE_RADIUS + 8) / 2}
                  r={NODE_RADIUS}
                  fill={isFilled ? `url(#${colorKey}Gradient)` : '#fff'}
                  stroke={isFilled ? cmap.filled : cmap.outlined}
                  strokeWidth={isFilled ? 0 : 2}
                  filter={isFilled ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' : undefined}
                  aria-current={isFilled && idx === lastCompletedIndex ? 'step' : undefined}
                />
              );
            })}
          </svg>

          {/* Subtitle row - BELOW the tram line (only if at least one subtitle) */}
          {stops.some((stop) => stop.subtitle) && (
            <div style={{ width: '100%', padding: `0 ${sidePadding}px`, marginTop: 8 }}>
              <div className="flex justify-center" style={{ gap: labelGap }}>
                {stops.map((stop, idx) => {
                  const shouldBeGreyedOut = ended && idx > lastCompletedIndex;
                  const textColor = shouldBeGreyedOut ? COLOR_MAP.grey.stroke : '#9ca3af'; // gray-400

                  return (
                    <div
                      key={stop.status + '-subtitle'}
                      style={{
                        width: labelAreaWidth,
                        maxWidth: MAX_LABEL_WIDTH,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        className="text-xs leading-tight text-center break-words"
                        style={{
                          wordBreak: 'break-word',
                          whiteSpace: 'normal',
                          color: textColor,
                        }}
                      >
                        {formatSubtitle(stop.subtitle)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {message && <div className="w-full px-4 mt-4">{message}</div>}
    </div>
  );
}
