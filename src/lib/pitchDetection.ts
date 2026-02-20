import { STRING_MIDI_BASE, NOTE_NAMES } from './music';

// === YIN Pitch Detection Algorithm ===
// High-accuracy autocorrelation-based pitch detection

const YIN_THRESHOLD = 0.15;
const MIN_FREQUENCY = 70;   // ~D2 (lowest guitar note in drop D)
const MAX_FREQUENCY = 1400;  // well above highest common guitar note

export interface PitchResult {
  frequency: number;
  confidence: number;
  noteName: string;
  octave: number;
  midi: number;
  centsOff: number; // how many cents sharp (+) or flat (-) from nearest note
}

export interface GuitarMapping {
  stringIndex: number;
  fret: number;
  stringName: string;
  distance: number; // how far from ideal pitch (in semitones)
}

/**
 * YIN pitch detection on a Float32Array buffer.
 * Returns null if no clear pitch is detected.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): PitchResult | null {
  const bufferSize = buffer.length;

  // Step 1: Check if signal has enough energy
  let rms = 0;
  for (let i = 0; i < bufferSize; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / bufferSize);
  if (rms < 0.01) return null; // too quiet

  const halfBuffer = Math.floor(bufferSize / 2);
  const minPeriod = Math.floor(sampleRate / MAX_FREQUENCY);
  const maxPeriod = Math.floor(sampleRate / MIN_FREQUENCY);

  // Step 2: Difference function
  const yinBuffer = new Float32Array(halfBuffer);
  for (let tau = 0; tau < halfBuffer; tau++) {
    let sum = 0;
    for (let i = 0; i < halfBuffer; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    yinBuffer[tau] = sum;
  }

  // Step 3: Cumulative mean normalized difference
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfBuffer; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
  }

  // Step 4: Absolute threshold
  let tau = minPeriod;
  let bestTau = -1;
  while (tau < Math.min(maxPeriod, halfBuffer)) {
    if (yinBuffer[tau] < YIN_THRESHOLD) {
      // Find the local minimum
      while (tau + 1 < halfBuffer && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
    tau++;
  }

  if (bestTau === -1) return null;

  // Step 5: Parabolic interpolation for sub-sample accuracy
  let betterTau: number;
  const x0 = bestTau < 1 ? bestTau : bestTau - 1;
  const x2 = bestTau + 1 < halfBuffer ? bestTau + 1 : bestTau;
  if (x0 === bestTau) {
    betterTau = yinBuffer[bestTau] <= yinBuffer[x2] ? bestTau : x2;
  } else if (x2 === bestTau) {
    betterTau = yinBuffer[bestTau] <= yinBuffer[x0] ? bestTau : x0;
  } else {
    const s0 = yinBuffer[x0];
    const s1 = yinBuffer[bestTau];
    const s2 = yinBuffer[x2];
    betterTau = bestTau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  }

  const frequency = sampleRate / betterTau;
  const confidence = 1 - yinBuffer[bestTau];

  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY || confidence < 0.7) return null;

  // Map to note
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const roundedMidi = Math.round(midi);
  const centsOff = Math.round((midi - roundedMidi) * 100);
  const noteIndex = ((roundedMidi % 12) + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;

  return {
    frequency,
    confidence,
    noteName: NOTE_NAMES[noteIndex],
    octave,
    midi: roundedMidi,
    centsOff,
  };
}

/**
 * Map a detected pitch to possible guitar string/fret combos.
 * Returns sorted by most natural position (lowest fret preference).
 */
export function mapToGuitar(midi: number): GuitarMapping[] {
  const STRING_NAMES_MAP = ['e', 'B', 'G', 'D', 'A', 'E'];
  const mappings: GuitarMapping[] = [];

  for (let s = 0; s < 6; s++) {
    const fret = midi - STRING_MIDI_BASE[s];
    if (fret >= 0 && fret <= 24) {
      mappings.push({
        stringIndex: s,
        fret,
        stringName: STRING_NAMES_MAP[s],
        distance: Math.abs(fret - 5), // prefer mid-fret positions slightly
      });
    }
  }

  // Sort: prefer lower frets (open strings first), then middle strings
  mappings.sort((a, b) => a.fret - b.fret || Math.abs(a.stringIndex - 3) - Math.abs(b.stringIndex - 3));
  return mappings;
}

/**
 * Smooth pitch over multiple readings to reduce jitter.
 */
export class PitchSmoother {
  private history: number[] = [];
  private readonly windowSize: number;

  constructor(windowSize = 5) {
    this.windowSize = windowSize;
  }

  add(midi: number): number {
    this.history.push(midi);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
    // Median filter (robust against outliers)
    const sorted = [...this.history].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  reset() {
    this.history = [];
  }
}
