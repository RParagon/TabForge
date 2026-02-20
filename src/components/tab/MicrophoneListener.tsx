import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Circle, ArrowRight, Radio, Music2, Zap, Timer, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectPitch, mapToGuitar, PitchSmoother, PitchResult, GuitarMapping } from '@/lib/pitchDetection';
import { STRING_NAMES, NOTE_NAMES_PT, getNoteFromFret } from '@/lib/music';

interface MicrophoneListenerProps {
  onNoteCommitted: (stringIndex: number, fret: number, advanceBeat: boolean) => void;
  onAddBeat: () => void;
  currentBeatIndex: number;
  totalBeats: number;
  tempo: number;
}

type ListenMode = 'manual' | 'sequential' | 'bpm_sync';

interface CapturedBeat {
  stringIndex: number;
  fret: number;
  noteName: string;
}

const MODE_LABELS: Record<ListenMode, string> = {
  manual: 'Manual',
  sequential: 'Sequencial (silêncio)',
  bpm_sync: 'Sync BPM',
};

export const MicrophoneListener: React.FC<MicrophoneListenerProps> = ({
  onNoteCommitted,
  onAddBeat,
  currentBeatIndex,
  totalBeats,
  tempo,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [currentPitch, setCurrentPitch] = useState<PitchResult | null>(null);
  // Live mappings (cleared on silence)
  const [guitarMappings, setGuitarMappings] = useState<GuitarMapping[]>([]);
  // STICKY mappings — last detected, persisted until user adds or clears
  const [stickyMappings, setStickyMappings] = useState<GuitarMapping[]>([]);
  const [stickyPitch, setStickyPitch] = useState<PitchResult | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<number>(0);
  const [sensitivity, setSensitivity] = useState(0.78);
  const [noteHistory, setNoteHistory] = useState<PitchResult[]>([]);
  const [mode, setMode] = useState<ListenMode>('manual');
  const [capturedHistory, setCapturedHistory] = useState<CapturedBeat[]>([]);
  const [vuLevel, setVuLevel] = useState(0);
  const [isNoteActive, setIsNoteActive] = useState(false);
  const [recordingBeat, setRecordingBeat] = useState(0);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [stickyLocked, setStickyLocked] = useState(false); // manual pin

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const smootherRef = useRef(new PitchSmoother(5));
  const lastNoteRef = useRef<number | null>(null);
  const isNoteActiveRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const pendingNoteRef = useRef<{ stringIndex: number; fret: number } | null>(null);
  const bpmIntervalRef = useRef<number | null>(null);
  const recordingBeatRef = useRef(0);
  // Synchronous flag to stop the RAF loop immediately (React state is async)
  const isListeningRef = useRef(false);

  // ── KEY FIX: always call the LATEST onNoteCommitted via ref so RAF loops
  //            never have a stale closure issue.
  const onNoteCommittedRef = useRef(onNoteCommitted);
  useEffect(() => { onNoteCommittedRef.current = onNoteCommitted; }, [onNoteCommitted]);

  const SILENCE_COMMIT_MS = 300;
  const ONSET_RMS_THRESHOLD = 0.013;
  const SILENCE_RMS_THRESHOLD = 0.007;

  // ─── Start ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });

      const audioContext = new AudioContext({ sampleRate: 44100 });
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      streamRef.current = stream;
      smootherRef.current.reset();
      lastNoteRef.current = null;
      recordingBeatRef.current = currentBeatIndex;
      silenceStartRef.current = null;
      pendingNoteRef.current = null;
      isListeningRef.current = true;  // set before RAF starts

      setIsListening(true);
      setRecordingBeat(currentBeatIndex);
      setCapturedHistory([]);

      const buffer = new Float32Array(analyser.fftSize);

      // BPM Sync interval
      if (mode === 'bpm_sync') {
        const interval = (60 / tempo) * 1000;
        bpmIntervalRef.current = window.setInterval(() => {
          if (pendingNoteRef.current) {
            const { stringIndex, fret } = pendingNoteRef.current;
            onNoteCommittedRef.current(stringIndex, fret, true);
            const noteName = getNoteFromFret(stringIndex, fret).name;
            setCapturedHistory(prev => [...prev.slice(-15), { stringIndex, fret, noteName }]);
            pendingNoteRef.current = null;
          } else {
            onNoteCommittedRef.current(0, -1, true);
          }
          recordingBeatRef.current++;
          setRecordingBeat(r => r + 1);
        }, interval);
      }

      const detect = () => {
        analyser.getFloatTimeDomainData(buffer);

        // RMS for VU
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / buffer.length);
        setVuLevel(Math.min(1, rms * 20));

        const pitch = detectPitch(buffer, audioContext.sampleRate);

        if (pitch && pitch.confidence >= sensitivity && rms >= ONSET_RMS_THRESHOLD) {
          // — Note detected —
          const smoothedMidi = smootherRef.current.add(pitch.midi);
          const smoothedPitch = { ...pitch, midi: smoothedMidi };

          setCurrentPitch(smoothedPitch);
          setIsNoteActive(true);
          isNoteActiveRef.current = true;
          silenceStartRef.current = null;
          setSilenceCountdown(null);

          const mappings = mapToGuitar(smoothedMidi);
          setGuitarMappings(mappings);

          if (mappings.length > 0) {
            pendingNoteRef.current = { stringIndex: mappings[0].stringIndex, fret: mappings[0].fret };

            // Update sticky only if note changed or nothing locked
            if (smoothedMidi !== lastNoteRef.current) {
              setStickyMappings(mappings);
              setStickyPitch(smoothedPitch);
              setSelectedMapping(0);
              setStickyLocked(false);
            }
          }

          if (smoothedMidi !== lastNoteRef.current) {
            lastNoteRef.current = smoothedMidi;
            setNoteHistory(prev => [...prev.slice(-19), smoothedPitch]);
          }
        } else {
          // — Silence / below threshold —
          if (isNoteActiveRef.current) {
            isNoteActiveRef.current = false;
            setIsNoteActive(false);
            setCurrentPitch(null);
            // DO NOT clear guitarMappings here — keep them visible
          }

          // Sequential mode: start/advance silence timer
          if (mode === 'sequential' && pendingNoteRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now();
            }
            const elapsed = Date.now() - silenceStartRef.current;
            const remaining = Math.max(0, SILENCE_COMMIT_MS - elapsed);
            setSilenceCountdown(remaining);

            if (elapsed >= SILENCE_COMMIT_MS) {
              const { stringIndex, fret } = pendingNoteRef.current;
              onNoteCommittedRef.current(stringIndex, fret, true);   // ← always fresh ref
              const noteName = getNoteFromFret(stringIndex, fret).name;
              setCapturedHistory(prev => [...prev.slice(-15), { stringIndex, fret, noteName }]);
              pendingNoteRef.current = null;
              silenceStartRef.current = null;
              setSilenceCountdown(null);
              recordingBeatRef.current++;
              setRecordingBeat(r => r + 1);
            }
          } else if (!pendingNoteRef.current) {
            silenceStartRef.current = null;
            setSilenceCountdown(null);
          }

          if (rms < SILENCE_RMS_THRESHOLD) {
            setGuitarMappings([]);
          }
        }

        // Only reschedule if still listening (synchronous check)
        if (isListeningRef.current) {
          animFrameRef.current = requestAnimationFrame(detect);
        }
      };

      detect();
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [sensitivity, mode, tempo, currentBeatIndex]);

  // ─── Stop ──────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    // Stop the RAF loop synchronously BEFORE cancelling — avoids the 1-frame lag
    isListeningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (bpmIntervalRef.current) clearInterval(bpmIntervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    animFrameRef.current = null;
    bpmIntervalRef.current = null;

    setIsListening(false);
    setCurrentPitch(null);
    setGuitarMappings([]);
    setIsNoteActive(false);
    setVuLevel(0);
    setSilenceCountdown(null);
    smootherRef.current.reset();
    pendingNoteRef.current = null;
    silenceStartRef.current = null;
    isNoteActiveRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    isListeningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (bpmIntervalRef.current) clearInterval(bpmIntervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
  }, []);

  // ─── Manual add helpers ────────────────────────────────────────────────────
  // Source of truth for which mappings to show: live if active, sticky otherwise
  const displayMappings = guitarMappings.length > 0 ? guitarMappings : stickyMappings;
  const displayPitch = currentPitch ?? stickyPitch;

  const addSelectedNote = () => {
    if (displayMappings.length > 0) {
      const m = displayMappings[selectedMapping];
      onNoteCommittedRef.current(m.stringIndex, m.fret, false);
    }
  };

  const addAndAdvance = () => {
    if (displayMappings.length > 0) {
      const m = displayMappings[selectedMapping];
      onNoteCommittedRef.current(m.stringIndex, m.fret, true);
    }
  };

  const clearSticky = () => {
    setStickyMappings([]);
    setStickyPitch(null);
    setStickyLocked(false);
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const centsColor = (cents: number) => {
    const abs = Math.abs(cents);
    if (abs <= 5) return 'text-green-400';
    if (abs <= 15) return 'text-yellow-400';
    return 'text-red-400';
  };

  const fretDifficulty = (fret: number) => {
    if (fret <= 7) return 'text-green-400';
    if (fret <= 14) return 'text-yellow-400';
    return 'text-red-400';
  };

  const isSticky = !isNoteActive && displayMappings.length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-primary flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Escuta Inteligente
        </h3>
        <Button
          size="sm"
          variant={isListening ? 'destructive' : 'default'}
          onClick={isListening ? stopListening : startListening}
        >
          {isListening
            ? <><MicOff className="w-4 h-4 mr-1" /> Parar</>
            : <><Mic className="w-4 h-4 mr-1" /> Ouvir</>}
        </Button>
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-1.5">
        {(['manual', 'sequential', 'bpm_sync'] as ListenMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={isListening}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40 ${mode === m
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
          >
            {m === 'manual' && <ArrowRight className="w-3 h-3" />}
            {m === 'sequential' && <Radio className="w-3 h-3" />}
            {m === 'bpm_sync' && <Timer className="w-3 h-3" />}
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Mode description */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {mode === 'manual' && 'A nota detectada fica "travada" na tela. Você decide quando inserir, mesmo após parar de tocar.'}
        {mode === 'sequential' && 'Cada nota é adicionada ao próximo tempo automaticamente após 300ms de silêncio.'}
        {mode === 'bpm_sync' && `Captura a nota mais recente a cada batida (${Math.round(60000 / tempo)}ms) e avança o cursor.`}
      </p>

      {/* Sensitivity */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground shrink-0">Sensibilidade:</span>
        <input
          type="range" min="0.5" max="1.0" step="0.05"
          value={sensitivity}
          onChange={e => setSensitivity(parseFloat(e.target.value))}
          className="flex-1 h-1.5 accent-primary"
        />
        <span className="text-muted-foreground font-mono w-8">{Math.round(sensitivity * 100)}%</span>
      </div>

      {/* VU Meter */}
      {isListening && (
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Nível de entrada</span>
          <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${isNoteActive ? 'bg-green-400' : 'bg-green-600/40'}`}
              style={{ width: `${vuLevel * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Sequential recording cursor */}
      {isListening && (mode === 'sequential' || mode === 'bpm_sync') && (
        <div className="bg-secondary/60 rounded-lg px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="text-xs font-semibold text-foreground">
              Gravando: Tempo <span className="text-primary font-mono">{recordingBeat + 1}</span>
            </span>
          </div>
          {silenceCountdown !== null && mode === 'sequential' && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3 text-yellow-400" />
              {silenceCountdown}ms para confirmar
            </div>
          )}
        </div>
      )}

      {/* Current pitch display */}
      {isListening && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            {/* Active indicator */}
            <div className="relative flex items-center justify-center">
              <Circle className={`w-3 h-3 ${isNoteActive ? 'text-green-400 fill-green-400' : 'text-muted-foreground'} transition-colors`} />
              {isNoteActive && <span className="absolute w-5 h-5 rounded-full bg-green-400/20 animate-ping" />}
            </div>

            {displayPitch ? (
              <div className="flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-3xl font-black font-mono ${isSticky ? 'text-primary/80' : 'text-accent'}`}>
                    {displayPitch.noteName}
                    <span className="text-lg text-muted-foreground">{displayPitch.octave}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({NOTE_NAMES_PT[displayPitch.noteName]})
                  </span>
                  <span className={`text-xs font-mono ${centsColor(displayPitch.centsOff)}`}>
                    {displayPitch.centsOff > 0 ? '+' : ''}{displayPitch.centsOff}¢
                  </span>
                  {isSticky && (
                    <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                      <Pin className="w-2.5 h-2.5" /> nota travada
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {displayPitch.frequency.toFixed(1)} Hz · Confiança: {Math.round(displayPitch.confidence * 100)}%
                </div>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">Aguardando nota...</span>
            )}
          </div>

          {/* Tuning meter (live only) */}
          {currentPitch && (
            <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
              <div
                className={`absolute top-0.5 bottom-0.5 w-3 rounded-full transition-all duration-100 ${Math.abs(currentPitch.centsOff) <= 5 ? 'bg-green-400'
                  : Math.abs(currentPitch.centsOff) <= 15 ? 'bg-yellow-400'
                    : 'bg-red-400'
                  }`}
                style={{ left: `${50 + (currentPitch.centsOff / 50) * 40}%`, transform: 'translateX(-50%)' }}
              />
            </div>
          )}

          {/* Guitar mappings — shown even after sound stops (sticky) */}
          {displayMappings.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Posições no violão{isSticky ? ' (última nota)' : ''}:
                </span>
                {isSticky && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={clearSticky}
                  >
                    limpar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {displayMappings.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedMapping(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${i === selectedMapping
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/50'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                  >
                    <span className="opacity-70">corda </span>{m.stringName}
                    <span className="mx-1 opacity-40">·</span>
                    <span className="opacity-70">casa </span>
                    <span className={fretDifficulty(m.fret)}>{m.fret}</span>
                  </button>
                ))}
              </div>

              {/* Action buttons — always visible as long as there's a mapping */}
              {mode === 'manual' && (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={addSelectedNote}>
                    <ArrowRight className="w-3.5 h-3.5 mr-1" />
                    Inserir neste tempo
                  </Button>
                  <Button size="sm" variant="default" onClick={addAndAdvance}>
                    <Music2 className="w-3.5 h-3.5 mr-1" />
                    Inserir e avançar
                  </Button>
                </div>
              )}
              {mode === 'sequential' && pendingNoteRef.current && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Pare de tocar para confirmar a nota no próximo tempo
                </p>
              )}
            </div>
          )}

          {/* Note history */}
          {noteHistory.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notas detectadas:</span>
              <div className="flex flex-wrap gap-1">
                {noteHistory.slice(-16).map((n, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs font-mono font-bold">
                    {n.noteName}{n.octave}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Captured beats (sequential) */}
          {capturedHistory.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tempos gravados:</span>
              <div className="flex flex-wrap gap-1.5">
                {capturedHistory.map((c, i) => (
                  <div key={i} className="flex flex-col items-center px-2 py-1 bg-primary/10 rounded text-xs gap-0.5">
                    <span className="text-primary font-bold font-mono">{c.noteName}</span>
                    <span className="text-muted-foreground font-mono text-[9px]">{STRING_NAMES[c.stringIndex]}/{c.fret}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isListening && (
        <p className="text-xs text-muted-foreground">
          Clique em{' '}
          <span className="text-primary font-semibold">"Ouvir"</span>{' '}
          para capturar notas do seu violão.{' '}
          {mode === 'sequential'
            ? 'No modo Sequencial, cada nota é confirmada pelo silêncio e adicionada automaticamente.'
            : mode === 'bpm_sync'
              ? `No modo BPM Sync, o cursor avança a cada ${Math.round(60000 / tempo)}ms no ritmo do BPM.`
              : 'No modo Manual, a nota fica travada na tela e você insere quando quiser.'
          }
        </p>
      )}
    </div>
  );
};
