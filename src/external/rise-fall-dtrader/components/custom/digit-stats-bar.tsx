
import { useRef, useEffect, useState } from 'react';
import type { DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';

interface DigitStatsBarProps {
  digitStats: DigitStats;
  selectedDigit: number;
  onDigitSelect: (digit: number) => void;
  lastDigit?: number | null;
}

interface DigitCircleProps {
  digit: number;
  pct: number;
  isSelected: boolean;
  isLast: boolean;
  isHighest: boolean;
  isLowest: boolean;
  hasData: boolean;
  onClick: () => void;
}

const SCAN_STYLE_ID = 'digit-stats-scan-styles';
function ScanStyles() {
  return (
    <style id={SCAN_STYLE_ID}>{`
      @keyframes digit-scan-sweep {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }
      @keyframes digit-selected-pulse {
        0% { box-shadow: 0 0 0 0 rgba(245,158,11,0.55); }
        70% { box-shadow: 0 0 0 4px rgba(245,158,11,0); }
        100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
      }
    `}</style>
  );
}

function ScanningIndicator() {
  return (
    <span
      title="Live — scanning tick stream"
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '14px',
        height: '8px',
        borderRadius: '2px',
        border: '1px solid rgba(0,210,211,0.5)',
        background: 'rgba(0,210,211,0.08)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '30%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, #00d2d3, transparent)',
          animation: 'digit-scan-sweep 1.6s linear infinite',
        }}
      />
    </span>
  );
}

function DigitCircle({
  digit,
  pct,
  isSelected,
  isLast,
  isHighest,
  isLowest,
  hasData,
  onClick,
}: DigitCircleProps) {
  const viewBoxSize = 48;
  const strokeWidth = 3;
  const radius = (viewBoxSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillRatio = hasData ? pct / 100 : 0;
  const dashOffset = circumference * (1 - fillRatio);
  const insetPct = ((strokeWidth + 2) / viewBoxSize) * 100;

  const arcColor = isSelected
    ? '#f59e0b'
    : isLowest
    ? '#ef4444'
    : isHighest
    ? '#00d2d3'
    : '#4b5563';

  const pctColor = isSelected
    ? '#f59e0b'
    : isLowest
    ? '#ef4444'
    : isHighest
    ? '#00d2d3'
    : '#9ca3af';

  const ringBg = isSelected ? '#2b2210' : '#1f2937';
  const outerGlow = isSelected ? '0 0 10px 3px rgba(245,158,11,0.45)' : 'none';

  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%' }}
      aria-label={`Select digit ${digit}`}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
        <svg
          viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transform: 'rotate(-90deg)',
          }}
        >
          <circle
            cx={viewBoxSize / 2}
            cy={viewBoxSize / 2}
            r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={viewBoxSize / 2}
            cy={viewBoxSize / 2}
            r={radius}
            fill="none"
            stroke={arcColor}
            strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease, stroke-width 0.2s ease' }}
          />
        </svg>

        <div
          style={{
            position: 'absolute',
            top: `${insetPct}%`,
            left: `${insetPct}%`,
            right: `${insetPct}%`,
            bottom: `${insetPct}%`,
            borderRadius: '50%',
            background: ringBg,
            boxShadow: outerGlow,
            border: isSelected ? '1.5px solid #f59e0b' : 'none',
            animation: isSelected ? 'digit-selected-pulse 1.8s infinite' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {digit}
          </span>
          <span
            style={{
              color: pctColor,
              fontSize: '6px',
              fontWeight: 600,
              lineHeight: 1.3,
              fontFamily: 'monospace',
              transition: 'color 0.3s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {hasData ? `${pct.toFixed(1)}%` : '—'}
          </span>
        </div>

        {isSelected && (
          <div
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: '#f59e0b',
              border: '1.5px solid #2b2210',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#1a1200', fontSize: '6px', fontWeight: 900, lineHeight: 1 }}>✓</span>
          </div>
        )}

        {isLast && (
          <div
            style={{
              position: 'absolute',
              bottom: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '5px solid #ef4444',
              transition: 'left 0.2s ease',
            }}
          />
        )}
      </div>
    </button>
  );
}

/**
 * Self-deduplicating digit stats bar.
 * 
 * BUGFIX: if multiple instances mount (e.g. old cached component + new one,
 * or parent renders twice), only the FIRST instance stays visible. All
 * subsequent instances detect that one already exists and render nothing.
 * This guarantees exactly one bar on screen regardless of React double-
 * mounts, HMR, or parent re-renders.
 */
export function DigitStatsBar({
  digitStats,
  selectedDigit,
  onDigitSelect,
  lastDigit = null,
}: DigitStatsBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      const all = document.querySelectorAll('[data-digit-stats-bar-root]');
      if (all.length > 1 && rootRef.current && all[0] !== rootRef.current) {
        setShouldRender(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!shouldRender) return null;

  const maxPct = Math.max(...digitStats.percentages);
  const minPct = Math.min(...digitStats.percentages);
  const hasData = digitStats.totalTicks > 0;

  return (
    <div
      ref={rootRef}
      data-digit-stats-bar-root
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 'min(96%, 520px)',
        /* No background, no border, no shadow — circles float directly on the chart */
        padding: '4px',
      }}
    >
      <ScanStyles />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          marginBottom: '4px',
          color: '#9ca3af',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="text-[9px] text-muted-foreground">Last digit prediction</span>
          <ScanningIndicator />
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(10, minmax(28px, 1fr))',
          gap: '4px',
          placeItems: 'center',
          width: '100%',
        }}
      >
        {digitStats.percentages.map((pct, digit) => (
          <DigitCircle
            key={digit}
            digit={digit}
            pct={pct}
            isSelected={digit === selectedDigit}
            isLast={digit === lastDigit}
            isHighest={hasData && pct === maxPct}
            isLowest={hasData && pct === minPct}
            hasData={hasData}
            onClick={() => onDigitSelect(digit)}
          />
        ))}
      </div>
    </div>
  );
}
