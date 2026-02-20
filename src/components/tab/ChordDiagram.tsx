import React from 'react';
import { ChordFingering, STRING_NAMES } from '@/lib/music';

interface Props {
  chord: ChordFingering;
  size?: 'sm' | 'md';
}

export const ChordDiagram: React.FC<Props> = ({ chord, size = 'md' }) => {
  const scale = size === 'sm' ? 0.7 : 1;
  const width = 130 * scale;
  const height = 170 * scale;
  const pad = { top: 35 * scale, left: 20 * scale, right: 15 * scale, bottom: 10 * scale };
  const strW = (width - pad.left - pad.right) / 5;
  const fretH = (height - pad.top - pad.bottom) / 4;

  // Diagram shows strings left-to-right as low E to high e (reversed from our internal order)
  const displayFrets = [...chord.frets].reverse();

  return (
    <svg width={width} height={height} className="select-none">
      {/* Chord name */}
      <text
        x={width / 2}
        y={12 * scale}
        textAnchor="middle"
        className="fill-foreground font-bold"
        fontSize={14 * scale}
      >
        {chord.name}
      </text>

      {/* Nut or fret indicator */}
      {chord.startFret <= 1 ? (
        <line x1={pad.left} y1={pad.top} x2={width - pad.right} y2={pad.top}
          stroke="hsl(var(--foreground))" strokeWidth={3 * scale} />
      ) : (
        <>
          <line x1={pad.left} y1={pad.top} x2={width - pad.right} y2={pad.top}
            stroke="hsl(var(--foreground))" strokeWidth={1} opacity={0.4} />
          <text x={pad.left - 8 * scale} y={pad.top + fretH * 0.6}
            textAnchor="middle" fontSize={10 * scale}
            className="fill-muted-foreground">{chord.startFret}fr</text>
        </>
      )}

      {/* Fret lines */}
      {[1, 2, 3, 4].map(f => (
        <line key={f}
          x1={pad.left} y1={pad.top + f * fretH}
          x2={width - pad.right} y2={pad.top + f * fretH}
          stroke="hsl(var(--foreground))" strokeWidth={0.8} opacity={0.2} />
      ))}

      {/* String lines */}
      {[0, 1, 2, 3, 4, 5].map(s => (
        <line key={s}
          x1={pad.left + s * strW} y1={pad.top}
          x2={pad.left + s * strW} y2={height - pad.bottom}
          stroke="hsl(var(--foreground))" strokeWidth={s < 3 ? 0.8 : 1.2 + s * 0.15} opacity={0.4} />
      ))}

      {/* Barres */}
      {chord.barres.map(barre => {
        const adjFret = barre - chord.startFret + 1;
        const y = pad.top + (adjFret - 0.5) * fretH;
        const revFrets = displayFrets;
        const first = revFrets.indexOf(barre);
        const last = revFrets.lastIndexOf(barre);
        if (first === -1 || first === last) return null;
        return (
          <rect key={barre}
            x={pad.left + first * strW - 6 * scale} y={y - 6 * scale}
            width={(last - first) * strW + 12 * scale} height={12 * scale}
            rx={6 * scale}
            fill="hsl(var(--primary))" opacity={0.85} />
        );
      })}

      {/* Finger positions */}
      {displayFrets.map((fret, idx) => {
        const x = pad.left + idx * strW;
        if (fret === -1) {
          return (
            <text key={idx} x={x} y={pad.top - 8 * scale}
              textAnchor="middle" fontSize={11 * scale}
              className="fill-destructive font-bold">✕</text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={idx} cx={x} cy={pad.top - 12 * scale} r={4.5 * scale}
              fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5 * scale} />
          );
        }
        const adjFret = fret - chord.startFret + 1;
        const y = pad.top + (adjFret - 0.5) * fretH;
        return (
          <circle key={idx} cx={x} cy={y} r={7 * scale}
            fill="hsl(var(--primary))" />
        );
      })}

      {/* String labels */}
      {[0, 1, 2, 3, 4, 5].map(idx => (
        <text key={idx}
          x={pad.left + idx * strW}
          y={height - 1}
          textAnchor="middle"
          fontSize={8 * scale}
          className="fill-muted-foreground"
        >
          {STRING_NAMES[5 - idx]}
        </text>
      ))}
    </svg>
  );
};
