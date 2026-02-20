// === Types ===
export interface Beat {
  strings: (number | null)[]; // 6 strings (high e to low E), null = not played
  isPause: boolean;
  tempoChange?: number;
}

export interface NoteInfo {
  name: string;
  fullName: string;
  octave: number;
  midi: number;
  frequency: number;
  stringIndex: number;
}

export interface ChordFingering {
  name: string;
  frets: number[]; // [e, B, G, D, A, E] order (high to low). -1=muted, 0=open
  startFret: number;
  barres: number[];
}

// === Constants ===
// Display order: top to bottom = high e to low E
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
export const STRING_MIDI_BASE = [64, 59, 55, 50, 45, 40];
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const NOTE_NAMES_PT: Record<string, string> = {
  'C': 'Dó', 'C#': 'Dó#', 'D': 'Ré', 'D#': 'Ré#', 'E': 'Mi',
  'F': 'Fá', 'F#': 'Fá#', 'G': 'Sol', 'G#': 'Sol#', 'A': 'Lá',
  'A#': 'Lá#', 'B': 'Si'
};

// === Note Calculation ===
export function getNoteFromFret(stringIndex: number, fret: number): NoteInfo {
  const midi = STRING_MIDI_BASE[stringIndex] + fret;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[noteIndex];
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);
  return { name, fullName: `${name}${octave}`, octave, midi, frequency, stringIndex };
}

export function getNotesFromBeat(beat: Beat): NoteInfo[] {
  if (beat.isPause) return [];
  const notes: NoteInfo[] = [];
  beat.strings.forEach((fret, idx) => {
    if (fret !== null) notes.push(getNoteFromFret(idx, fret));
  });
  return notes;
}

// === Chord Detection ===
const CHORD_PATTERNS: [string, number[]][] = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['m7', [0, 3, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['5', [0, 7]],
  ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]],
  ['add9', [0, 2, 4, 7]],
];

export function detectChords(notes: NoteInfo[]): string[] {
  if (notes.length < 2) return [];
  const uniqueNotes = [...new Set(notes.map(n => n.name))];
  if (uniqueNotes.length < 2) return [];

  const noteIndices = uniqueNotes.map(n => NOTE_NAMES.indexOf(n));
  const results: string[] = [];

  for (const rootIdx of noteIndices) {
    const intervals = [...new Set(noteIndices.map(idx => ((idx - rootIdx) + 12) % 12))].sort((a, b) => a - b);

    for (const [suffix, pattern] of CHORD_PATTERNS) {
      const normalizedPattern = pattern.map(p => p % 12);
      if (normalizedPattern.every(p => intervals.includes(p))) {
        results.push(`${NOTE_NAMES[rootIdx]}${suffix}`);
      }
    }
  }
  return [...new Set(results)].slice(0, 8);
}

// === Chord Library (frets in [e, B, G, D, A, E] order) ===
export const CHORD_LIBRARY: ChordFingering[] = [
  { name: 'C', frets: [0, 1, 0, 2, 3, -1], startFret: 1, barres: [] },
  { name: 'D', frets: [2, 3, 2, 0, -1, -1], startFret: 1, barres: [] },
  { name: 'E', frets: [0, 0, 1, 2, 2, 0], startFret: 1, barres: [] },
  { name: 'F', frets: [1, 1, 2, 3, 3, 1], startFret: 1, barres: [1] },
  { name: 'G', frets: [3, 0, 0, 0, 2, 3], startFret: 1, barres: [] },
  { name: 'A', frets: [0, 2, 2, 2, 0, -1], startFret: 1, barres: [] },
  { name: 'B', frets: [2, 4, 4, 4, 2, -1], startFret: 2, barres: [2] },
  { name: 'Am', frets: [0, 1, 2, 2, 0, -1], startFret: 1, barres: [] },
  { name: 'Bm', frets: [2, 3, 4, 4, 2, -1], startFret: 2, barres: [2] },
  { name: 'Cm', frets: [3, 4, 5, 5, 3, -1], startFret: 3, barres: [3] },
  { name: 'Dm', frets: [1, 3, 2, 0, -1, -1], startFret: 1, barres: [] },
  { name: 'Em', frets: [0, 0, 0, 2, 2, 0], startFret: 1, barres: [] },
  { name: 'Fm', frets: [1, 1, 1, 3, 3, 1], startFret: 1, barres: [1] },
  { name: 'Gm', frets: [3, 3, 3, 5, 5, 3], startFret: 3, barres: [3] },
  { name: 'A7', frets: [0, 2, 0, 2, 0, -1], startFret: 1, barres: [] },
  { name: 'B7', frets: [2, 0, 2, 1, 2, -1], startFret: 1, barres: [] },
  { name: 'C7', frets: [0, 1, 3, 2, 3, -1], startFret: 1, barres: [] },
  { name: 'D7', frets: [2, 1, 2, 0, -1, -1], startFret: 1, barres: [] },
  { name: 'E7', frets: [0, 0, 1, 0, 2, 0], startFret: 1, barres: [] },
  { name: 'G7', frets: [1, 0, 0, 0, 2, 3], startFret: 1, barres: [] },
  { name: 'Am7', frets: [0, 1, 0, 2, 0, -1], startFret: 1, barres: [] },
  { name: 'Dm7', frets: [1, 1, 2, 0, -1, -1], startFret: 1, barres: [] },
  { name: 'Em7', frets: [0, 0, 0, 0, 2, 0], startFret: 1, barres: [] },
  { name: 'Cmaj7', frets: [0, 0, 0, 2, 3, -1], startFret: 1, barres: [] },
  { name: 'Fmaj7', frets: [0, 1, 2, 3, -1, -1], startFret: 1, barres: [] },
  { name: 'Gmaj7', frets: [2, 0, 0, 0, 2, 3], startFret: 1, barres: [] },
  { name: 'Dsus2', frets: [0, 3, 2, 0, -1, -1], startFret: 1, barres: [] },
  { name: 'Asus2', frets: [0, 0, 2, 2, 0, -1], startFret: 1, barres: [] },
  { name: 'Dsus4', frets: [3, 3, 2, 0, -1, -1], startFret: 1, barres: [] },
  { name: 'Asus4', frets: [0, 3, 2, 2, 0, -1], startFret: 1, barres: [] },
  { name: 'Esus4', frets: [0, 0, 2, 2, 2, 0], startFret: 1, barres: [] },
];

export function getChordFingering(name: string): ChordFingering | undefined {
  return CHORD_LIBRARY.find(c => c.name === name);
}

export function createEmptyBeat(): Beat {
  return { strings: [null, null, null, null, null, null], isPause: false };
}

export function createPauseBeat(): Beat {
  return { strings: [null, null, null, null, null, null], isPause: true };
}
