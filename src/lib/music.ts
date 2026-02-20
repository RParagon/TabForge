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

// Enharmonic display names (for transposition labels)
export const NOTE_NAMES_DISPLAY: Record<number, string> = {
  0: 'C', 1: 'C#/Db', 2: 'D', 3: 'D#/Eb', 4: 'E', 5: 'F',
  6: 'F#/Gb', 7: 'G', 8: 'G#/Ab', 9: 'A', 10: 'A#/Bb', 11: 'B'
};

// === Scale Definitions (intervals from root, in semitones) ===
export interface ScaleDefinition {
  name: string;
  label: string;
  intervals: number[];
  description: string;
}

export const SCALES: ScaleDefinition[] = [
  { name: 'major', label: 'Maior', intervals: [0, 2, 4, 5, 7, 9, 11], description: 'Escala Maior (Jônica)' },
  { name: 'natural_minor', label: 'Menor Natural', intervals: [0, 2, 3, 5, 7, 8, 10], description: 'Escala Menor Natural (Eólica)' },
  { name: 'harmonic_minor', label: 'Menor Harmônica', intervals: [0, 2, 3, 5, 7, 8, 11], description: 'Escala Menor Harmônica' },
  { name: 'dorian', label: 'Dórica', intervals: [0, 2, 3, 5, 7, 9, 10], description: 'Modo Dórico' },
  { name: 'phrygian', label: 'Frígia', intervals: [0, 1, 3, 5, 7, 8, 10], description: 'Modo Frígio' },
  { name: 'lydian', label: 'Lídia', intervals: [0, 2, 4, 6, 7, 9, 11], description: 'Modo Lídio' },
  { name: 'mixolydian', label: 'Mixolídia', intervals: [0, 2, 4, 5, 7, 9, 10], description: 'Modo Mixolídio' },
  { name: 'locrian', label: 'Lócria', intervals: [0, 1, 3, 5, 6, 8, 10], description: 'Modo Lócrio' },
  { name: 'major_pent', label: 'Pentatônica Maior', intervals: [0, 2, 4, 7, 9], description: 'Pentatônica Maior' },
  { name: 'minor_pent', label: 'Pentatônica Menor', intervals: [0, 3, 5, 7, 10], description: 'Pentatônica Menor' },
  { name: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10], description: 'Escala Blues' },
];

// === Diatonic chord qualities per scale degree for major/minor ===
const MAJOR_DIATONIC: string[] = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_DIATONIC: string[] = ['m', 'dim', '', 'm', 'm', '', '7'];
const MAJOR_DEGREE_LABELS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREE_LABELS = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10];

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

// === Transposition ===
/**
 * Transpose a single beat by N semitones.
 * Frets are shifted by moving along MIDI space. Strings are re-mapped to closest valid position.
 */
export function transposeBeat(beat: Beat, semitones: number): Beat {
  if (beat.isPause) return { ...beat };
  const strings = beat.strings.map((fret, stringIdx) => {
    if (fret === null) return null;
    const originalMidi = STRING_MIDI_BASE[stringIdx] + fret;
    const targetMidi = originalMidi + semitones;
    const newFret = targetMidi - STRING_MIDI_BASE[stringIdx];
    if (newFret >= 0 && newFret <= 24) return newFret;
    // Try to find another string that can play this MIDI note
    for (let s = 0; s < 6; s++) {
      const f = targetMidi - STRING_MIDI_BASE[s];
      if (f >= 0 && f <= 24) return f; // returns fret for first valid string — we keep stringIdx for now
    }
    return null; // out of range
  });
  return { ...beat, strings };
}

export function transposeBeats(beats: Beat[], semitones: number): Beat[] {
  return beats.map(b => transposeBeat(b, semitones));
}

// === Key Detection ===
export interface KeyMatch {
  root: number;     // 0–11 (C=0)
  quality: 'major' | 'minor';
  rootName: string;
  label: string;
  score: number;    // 0–100
  matchedNotes: string[];
  missingNotes: string[];
}

export function detectKey(beats: Beat[]): KeyMatch[] {
  // Collect all note MIDI classes (0–11)
  const noteCounts = new Array(12).fill(0);
  beats.forEach(beat => {
    getNotesFromBeat(beat).forEach(n => {
      noteCounts[((n.midi % 12) + 12) % 12]++;
    });
  });

  const totalNotes = noteCounts.reduce((a, b) => a + b, 0);
  if (totalNotes === 0) return [];

  const results: KeyMatch[] = [];

  for (let root = 0; root < 12; root++) {
    for (const quality of ['major', 'minor'] as const) {
      const steps = quality === 'major' ? MAJOR_SCALE_STEPS : MINOR_SCALE_STEPS;
      const scaleNotes = steps.map(s => (root + s) % 12);

      let score = 0;
      let covered = 0;
      for (let n = 0; n < 12; n++) {
        if (scaleNotes.includes(n)) {
          score += noteCounts[n] * 2; // in scale = reward
          if (noteCounts[n] > 0) covered++;
        } else {
          score -= noteCounts[n] * 3; // out of scale = penalty
        }
      }

      // Bonus if tonic is the most played note
      const maxCount = Math.max(...noteCounts);
      if (noteCounts[root] === maxCount) score += 10;

      const matchedNotes = scaleNotes
        .filter(n => noteCounts[n] > 0)
        .map(n => NOTE_NAMES[n]);
      const missingNotes = scaleNotes
        .filter(n => noteCounts[n] === 0)
        .map(n => NOTE_NAMES[n]);

      const normalizedScore = Math.max(0, Math.min(100, Math.round(((score + totalNotes * 3) / (totalNotes * 5)) * 100)));

      results.push({
        root,
        quality,
        rootName: NOTE_NAMES[root],
        label: `${NOTE_NAMES[root]} ${quality === 'major' ? 'Maior' : 'Menor'}`,
        score: normalizedScore,
        matchedNotes,
        missingNotes,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}

// === Scale Notes Utility ===
export function getScaleNotes(root: number, scaleName: string): number[] {
  const scale = SCALES.find(s => s.name === scaleName);
  if (!scale) return [];
  return scale.intervals.map(i => (root + i) % 12);
}

// === Harmony Suggestions ===
export interface ChordSuggestion {
  degree: string;
  name: string;
  function: string;
  notes: string[];
}

export interface ProgressionSuggestion {
  name: string;
  chords: ChordSuggestion[];
  description: string;
}

export function harmonySuggestions(root: number, quality: 'major' | 'minor'): ProgressionSuggestion[] {
  const steps = quality === 'major' ? MAJOR_SCALE_STEPS : MINOR_SCALE_STEPS;
  const qualities = quality === 'major' ? MAJOR_DIATONIC : MINOR_DIATONIC;
  const degrees = quality === 'major' ? MAJOR_DEGREE_LABELS : MINOR_DEGREE_LABELS;

  const diatonic: ChordSuggestion[] = steps.map((step, idx) => {
    const chordRoot = (root + step) % 12;
    const chordName = NOTE_NAMES[chordRoot] + qualities[idx];
    const chordIntervals = qualities[idx] === 'm' ? [0, 3, 7] :
      qualities[idx] === 'dim' ? [0, 3, 6] :
        qualities[idx] === '7' ? [0, 4, 7, 10] :
          [0, 4, 7];
    const chordNotes = chordIntervals.map(i => NOTE_NAMES[(chordRoot + i) % 12]);
    return { degree: degrees[idx], name: chordName, function: degreeFunction(idx, quality), notes: chordNotes };
  });

  const i = diatonic[0];
  const ii = diatonic[1];
  const iii = diatonic[2];
  const iv = diatonic[3];
  const v = diatonic[4];
  const vi = diatonic[5];

  const progressions: ProgressionSuggestion[] = [
    {
      name: quality === 'major' ? 'Cadência Perfeita (I–IV–V–I)' : 'Cadência Menor (i–iv–v–i)',
      chords: [i, iv, v, i],
      description: 'Progressão clássica, base de inúmeras músicas.',
    },
    {
      name: quality === 'major' ? 'ii–V–I' : 'ii°–V–i',
      chords: [ii, v, i],
      description: 'Progressão jazzística fundamental.',
    },
    {
      name: quality === 'major' ? 'I–V–vi–IV' : 'i–VII–VI–VII',
      chords: quality === 'major' ? [i, v, vi, iv] : [i, diatonic[6] || v, diatonic[5] || iv, diatonic[6] || v],
      description: 'Pop/Rock clássico — uma das mais usadas no mundo.',
    },
    {
      name: quality === 'major' ? 'I–IV–I–V' : 'i–iv–i–v',
      chords: [i, iv, i, v],
      description: 'Folk e country — simples e eficaz.',
    },
    {
      name: quality === 'major' ? 'I–iii–IV–V' : 'i–III–iv–v',
      chords: [i, iii, iv, v],
      description: 'Som introspectivo com tensão crescente.',
    },
    {
      name: 'Ciclo das Quintas',
      chords: [i, iv, diatonic[6] || v, iii || ii, vi || v, ii, v, i].slice(0, 4),
      description: 'Movimento harmônico pelo ciclo de quintas.',
    },
  ];

  return progressions;
}

function degreeFunction(idx: number, quality: 'major' | 'minor'): string {
  if (quality === 'major') {
    const fns = ['Tônica', 'Supertônica', 'Mediante', 'Subdominante', 'Dominante', 'Submediante', 'Sensível'];
    return fns[idx] || '';
  } else {
    const fns = ['Tônica', 'Supertônica', 'Mediante', 'Subdominante', 'Dominante', 'Submediante', 'Subtônica'];
    return fns[idx] || '';
  }
}

// === Melody Ideas ===
export interface MelodyVariation {
  name: string;
  description: string;
  beats: Beat[];
}

export function melodyIdeas(beats: Beat[], semitoneShift = 0): MelodyVariation[] {
  const notePauses = beats.filter(b => !b.isPause);
  if (notePauses.length === 0) return [];

  // Retrograde: reverse the beat sequence
  const retrograde = [...beats].reverse().map(b => ({ ...b, strings: [...b.strings] }));

  // Sequence up (shift by 2 semitones = major 2nd)
  const sequenceUp = transposeBeats(beats, 2);

  // Sequence down (shift by -2 semitones)
  const sequenceDown = transposeBeats(beats, -2);

  // Octave up (+12 semitones)
  const octaveUp = transposeBeats(beats, 12);

  // Octave down (-12 semitones)
  const octaveDown = transposeBeats(beats, -12);

  // Parallel 3rds: shift all notes up by 3 or 4 semitones (minor/major 3rd)
  const parallel3rds = transposeBeats(beats, 4);

  // Diminution: keep only every other beat (faster feel)
  const diminution = beats.filter((_, i) => i % 2 === 0);

  // Augmentation: duplicate each beat (slower feel)
  const augmentation: Beat[] = [];
  beats.forEach(b => { augmentation.push({ ...b }); augmentation.push({ ...b }); });

  return [
    { name: 'Retrógrado', description: 'Sequência de notas invertida (de trás para frente)', beats: retrograde },
    { name: 'Sequência +2 semitons', description: 'Mesma melodia deslocada 2 semitons acima', beats: sequenceUp },
    { name: 'Sequência -2 semitons', description: 'Mesma melodia deslocada 2 semitons abaixo', beats: sequenceDown },
    { name: 'Oitava acima', description: 'Toda a melodia transposta uma oitava para cima (+12 semitons)', beats: octaveUp },
    { name: 'Oitava abaixo', description: 'Toda a melodia transposta uma oitava para baixo (−12 semitons)', beats: octaveDown },
    { name: '3ª Paralela', description: 'Melodia harmonizada em terças maiores (+4 semitons)', beats: parallel3rds },
    { name: 'Diminuição', description: 'Apenas os tempos pares — sensação de velocidade dobrada', beats: diminution },
    { name: 'Aumentação', description: 'Cada tempo duplicado — sensação de melodia mais lenta e expansiva', beats: augmentation },
  ];
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

// === Best string mapping for a MIDI note ===
/**
 * Given a MIDI note, return the best (string, fret) pair that keeps
 * the fret as low as possible, preferring middle strings.
 */
export function bestGuitarPosition(midi: number): { stringIndex: number; fret: number } | null {
  let best: { stringIndex: number; fret: number } | null = null;
  for (let s = 0; s < 6; s++) {
    const fret = midi - STRING_MIDI_BASE[s];
    if (fret >= 0 && fret <= 24) {
      if (!best || fret < best.fret) {
        best = { stringIndex: s, fret };
      }
    }
  }
  return best;
}
