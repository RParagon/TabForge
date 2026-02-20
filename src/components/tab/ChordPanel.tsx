import React, { useState } from 'react';
import { CHORD_LIBRARY, ChordFingering, getChordFingering, NOTE_NAMES_PT, STRING_NAMES } from '@/lib/music';
import { ChordDiagram } from './ChordDiagram';
import { X, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  selectedChord: string | null;
  detectedChords: string[];
  onSelectChord: (name: string) => void;
  onClose: () => void;
}

const CATEGORIES = [
  { label: 'Maiores', filter: (c: ChordFingering) => !c.name.includes('m') && !c.name.includes('7') && !c.name.includes('sus') && !c.name.includes('dim') && !c.name.includes('aug') && !c.name.includes('maj') && !c.name.includes('add') && !c.name.includes('6') && !c.name.includes('5') },
  { label: 'Menores', filter: (c: ChordFingering) => c.name.includes('m') && !c.name.includes('maj') && !c.name.includes('7') && !c.name.includes('6') },
  { label: 'Com 7ª', filter: (c: ChordFingering) => c.name.includes('7') },
  { label: 'Sus / Outros', filter: (c: ChordFingering) => c.name.includes('sus') || c.name.includes('add') || c.name.includes('dim') || c.name.includes('aug') || c.name.includes('6') || c.name.includes('5') },
];

export const ChordPanel: React.FC<Props> = ({ selectedChord, detectedChords, onSelectChord, onClose }) => {
  const [activeCategory, setActiveCategory] = useState(0);
  const fingering = selectedChord ? getChordFingering(selectedChord) : null;
  const filtered = CHORD_LIBRARY.filter(CATEGORIES[activeCategory].filter);

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-primary flex items-center gap-2 text-lg">
          <Music className="w-5 h-5" /> Biblioteca de Acordes
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Detected chords highlight */}
      {detectedChords.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Acordes detectados</p>
          <div className="flex flex-wrap gap-1.5">
            {detectedChords.map(name => (
              <button key={name} onClick={() => onSelectChord(name)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  selectedChord === name
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent/20 text-accent hover:bg-accent/30'
                }`}>
                {name}
                <span className="ml-1 opacity-60 text-xs">({NOTE_NAMES_PT[name.replace(/m.*|7.*|sus.*|add.*|dim|aug|maj.*/g, '')] || name})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-border pb-2">
        {CATEGORIES.map((cat, i) => (
          <button key={i} onClick={() => setActiveCategory(i)}
            className={`px-3 py-1.5 rounded-t text-xs font-semibold transition-colors ${
              activeCategory === i ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Chord list */}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(chord => (
          <button key={chord.name} onClick={() => onSelectChord(chord.name)}
            className={`px-2.5 py-1 rounded text-sm font-medium transition-colors ${
              selectedChord === chord.name
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}>
            {chord.name}
          </button>
        ))}
      </div>

      {/* Selected chord diagram */}
      {fingering && (
        <div className="flex flex-col sm:flex-row items-center gap-6 pt-2 border-t border-border">
          <ChordDiagram chord={fingering} size="md" />
          <div className="space-y-2 text-sm">
            <h4 className="text-xl font-bold text-foreground">{fingering.name}</h4>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Nome: </span>
              {NOTE_NAMES_PT[fingering.name.replace(/m.*|7.*|sus.*|add.*|dim|aug|maj.*/g, '')] || fingering.name}{' '}
              {fingering.name.includes('m') && !fingering.name.includes('maj') ? 'menor' : ''}
              {fingering.name.includes('7') ? ' com sétima' : ''}
              {fingering.name.includes('sus2') ? ' suspensa 2ª' : ''}
              {fingering.name.includes('sus4') ? ' suspensa 4ª' : ''}
              {fingering.name.includes('maj7') ? ' maior com 7ª maior' : ''}
            </p>
            <div>
              <span className="font-semibold text-foreground">Tablatura: </span>
              <span className="font-mono text-primary">
                {[...fingering.frets].reverse().map(f => f === -1 ? 'x' : f).join('  ')}
              </span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {STRING_NAMES.slice().reverse().map(s => s).join('  ')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
