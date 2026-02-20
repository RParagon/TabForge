import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Circle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectPitch, mapToGuitar, PitchSmoother, PitchResult, GuitarMapping } from '@/lib/pitchDetection';
import { STRING_NAMES, NOTE_NAMES_PT } from '@/lib/music';

interface MicrophoneListenerProps {
  onNoteDetected: (stringIndex: number, fret: number) => void;
  onAddBeat: () => void;
}

export const MicrophoneListener: React.FC<MicrophoneListenerProps> = ({
  onNoteDetected,
  onAddBeat,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [currentPitch, setCurrentPitch] = useState<PitchResult | null>(null);
  const [guitarMappings, setGuitarMappings] = useState<GuitarMapping[]>([]);
  const [selectedMapping, setSelectedMapping] = useState<number>(0);
  const [autoAdd, setAutoAdd] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.8); // 0.5 to 1.0
  const [noteHistory, setNoteHistory] = useState<PitchResult[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const smootherRef = useRef(new PitchSmoother(4));
  const lastNoteRef = useRef<number | null>(null);
  const lastNoteTimeRef = useRef(0);

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
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      streamRef.current = stream;
      smootherRef.current.reset();
      lastNoteRef.current = null;

      setIsListening(true);

      const bufferLength = analyser.fftSize;
      const buffer = new Float32Array(bufferLength);

      const detect = () => {
        analyser.getFloatTimeDomainData(buffer);
        const pitch = detectPitch(buffer, audioContext.sampleRate);

        if (pitch && pitch.confidence >= sensitivity) {
          const smoothedMidi = smootherRef.current.add(pitch.midi);
          const smoothedPitch = { ...pitch, midi: smoothedMidi };
          setCurrentPitch(smoothedPitch);

          const mappings = mapToGuitar(smoothedMidi);
          setGuitarMappings(mappings);
          setSelectedMapping(0);

          // Auto-add logic: if note changed and enough time passed
          const now = Date.now();
          if (
            autoAdd &&
            mappings.length > 0 &&
            smoothedMidi !== lastNoteRef.current &&
            now - lastNoteTimeRef.current > 300 // debounce 300ms
          ) {
            lastNoteRef.current = smoothedMidi;
            lastNoteTimeRef.current = now;
            onNoteDetected(mappings[0].stringIndex, mappings[0].fret);
          }

          setNoteHistory(prev => {
            const next = [...prev, smoothedPitch];
            return next.slice(-20);
          });
        } else {
          setCurrentPitch(null);
          setGuitarMappings([]);
        }

        animFrameRef.current = requestAnimationFrame(detect);
      };

      detect();
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [sensitivity, autoAdd, onNoteDetected]);

  const stopListening = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();

    setIsListening(false);
    setCurrentPitch(null);
    setGuitarMappings([]);
    smootherRef.current.reset();
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const addSelectedNote = () => {
    if (guitarMappings.length > 0) {
      const m = guitarMappings[selectedMapping];
      onNoteDetected(m.stringIndex, m.fret);
    }
  };

  const centsColor = (cents: number) => {
    const abs = Math.abs(cents);
    if (abs <= 5) return 'text-green-400';
    if (abs <= 15) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-primary flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Escuta Inteligente
        </h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoAdd}
              onChange={e => setAutoAdd(e.target.checked)}
              className="rounded border-border"
            />
            Auto-inserir
          </label>
          <Button
            size="sm"
            variant={isListening ? 'destructive' : 'default'}
            onClick={isListening ? stopListening : startListening}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4 mr-1" /> Parar
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-1" /> Ouvir
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Sensitivity */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sensibilidade:</span>
        <input
          type="range"
          min="0.5"
          max="1.0"
          step="0.05"
          value={sensitivity}
          onChange={e => setSensitivity(parseFloat(e.target.value))}
          className="flex-1 h-1.5 accent-primary"
        />
        <span className="text-muted-foreground font-mono w-8">{Math.round(sensitivity * 100)}%</span>
      </div>

      {isListening && (
        <div className="space-y-3">
          {/* Current detection */}
          <div className="flex items-center gap-4">
            {/* Animated indicator */}
            <div className="relative flex items-center justify-center">
              <Circle className={`w-3 h-3 ${currentPitch ? 'text-green-400 fill-green-400' : 'text-muted-foreground'} transition-colors`} />
              {currentPitch && (
                <span className="absolute w-5 h-5 rounded-full bg-green-400/20 animate-ping" />
              )}
            </div>

            {currentPitch ? (
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-accent font-mono">
                    {currentPitch.noteName}
                    <span className="text-lg text-muted-foreground">{currentPitch.octave}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({NOTE_NAMES_PT[currentPitch.noteName]})
                  </span>
                  <span className={`text-xs font-mono ${centsColor(currentPitch.centsOff)}`}>
                    {currentPitch.centsOff > 0 ? '+' : ''}{currentPitch.centsOff}¢
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentPitch.frequency.toFixed(1)} Hz · Confiança: {Math.round(currentPitch.confidence * 100)}%
                </div>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">Aguardando nota...</span>
            )}
          </div>

          {/* Tuning meter */}
          {currentPitch && (
            <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" />
              <div
                className={`absolute top-0.5 bottom-0.5 w-3 rounded-full transition-all duration-100 ${
                  Math.abs(currentPitch.centsOff) <= 5 ? 'bg-green-400' : Math.abs(currentPitch.centsOff) <= 15 ? 'bg-yellow-400' : 'bg-red-400'
                }`}
                style={{
                  left: `${50 + (currentPitch.centsOff / 50) * 40}%`,
                  transform: 'translateX(-50%)',
                }}
              />
            </div>
          )}

          {/* Guitar mappings */}
          {guitarMappings.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Posições no violão:</span>
              <div className="flex flex-wrap gap-1.5">
                {guitarMappings.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedMapping(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      i === selectedMapping
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/50'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                  >
                    corda {m.stringName} · casa {m.fret}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={addSelectedNote} className="mt-1">
                <ArrowRight className="w-3.5 h-3.5 mr-1" />
                Adicionar na tablatura
              </Button>
            </div>
          )}

          {/* Recent notes */}
          {noteHistory.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Últimas notas:</span>
              <div className="flex flex-wrap gap-1">
                {noteHistory.slice(-12).map((n, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs font-mono font-bold"
                  >
                    {n.noteName}{n.octave}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isListening && (
        <p className="text-xs text-muted-foreground">
          Clique em "Ouvir" para capturar notas do seu violão via microfone. A ferramenta detecta a nota tocada e sugere a posição na tablatura.
        </p>
      )}
    </div>
  );
};
