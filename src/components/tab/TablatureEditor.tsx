import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Beat, STRING_NAMES, createEmptyBeat, createPauseBeat,
  getNotesFromBeat, detectChords, NOTE_NAMES_PT, transposeBeats
} from '@/lib/music';
import { playNotes, playClick } from '@/lib/audio';
import { ChordPanel } from './ChordPanel';
import { MicrophoneListener } from './MicrophoneListener';
import { MelodyAnalysis } from './MelodyAnalysis';
import { Button } from '@/components/ui/button';
import {
  Plus, Pause, Play, Square, FileDown, Music,
  Trash2, Volume2, SkipForward, ChevronRight, Mic, Sparkles
} from 'lucide-react';

const BEATS_PER_LINE = 16;

export const TablatureEditor: React.FC = () => {
  const [title, setTitle] = useState('Minha Tablatura');
  const [beats, setBeats] = useState<Beat[]>(() =>
    Array.from({ length: 8 }, () => createEmptyBeat())
  );
  const [tempo, setTempo] = useState(120);
  const [selectedBeat, setSelectedBeat] = useState(0);
  // Ref that always mirrors selectedBeat so long-lived closures (RAF loops)
  // can read the CURRENT beat without a stale-closure bug.
  const selectedBeatRef = useRef(0);
  useEffect(() => { selectedBeatRef.current = selectedBeat; }, [selectedBeat]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayBeat, setCurrentPlayBeat] = useState(-1);
  const [showChordPanel, setShowChordPanel] = useState(false);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);
  const [showMicListener, setShowMicListener] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [recordingCursor, setRecordingCursor] = useState<number | null>(null); // beat index with pulsing cursor
  const playTimeoutRef = useRef<number | null>(null);

  // ── Beat editing ────────────────────────────────────────────────────────────
  const updateFret = (beatIdx: number, stringIdx: number, value: string) => {
    setBeats(prev => {
      const next = [...prev];
      const num = parseInt(value);
      next[beatIdx] = {
        ...next[beatIdx],
        strings: next[beatIdx].strings.map((s, i) =>
          i === stringIdx ? (isNaN(num) || value === '' ? null : Math.min(24, Math.max(0, num))) : s
        ),
      };
      return next;
    });
  };

  const addBeat = useCallback(() => setBeats(prev => [...prev, createEmptyBeat()]), []);
  const addPause = () => setBeats(prev => [...prev, createPauseBeat()]);

  const insertBeatAfter = (idx: number) => {
    setBeats(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, createEmptyBeat());
      return next;
    });
  };

  const removeBeat = (idx: number) => {
    if (beats.length <= 1) return;
    setBeats(prev => prev.filter((_, i) => i !== idx));
    if (selectedBeat >= beats.length - 1) setSelectedBeat(Math.max(0, beats.length - 2));
  };

  const togglePause = (idx: number) => {
    setBeats(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], isPause: !next[idx].isPause };
      return next;
    });
  };

  const setTempoChange = (idx: number, newTempo: number | undefined) => {
    setBeats(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], tempoChange: newTempo };
      return next;
    });
  };

  // ── Playback ────────────────────────────────────────────────────────────────
  const playBeatSound = useCallback((beat: Beat) => {
    playClick();
    if (beat.isPause) return;
    const notes = getNotesFromBeat(beat);
    if (notes.length > 0) {
      playNotes(notes.map(n => n.frequency), 60 / tempo);
    }
  }, [tempo]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentPlayBeat(-1);
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
  }, []);

  const startPlayback = useCallback(() => {
    setIsPlaying(true);
    let idx = 0;

    const playNext = () => {
      if (idx >= beats.length) {
        stopPlayback();
        return;
      }
      setCurrentPlayBeat(idx);
      const beat = beats[idx];
      const currentTempo = beat.tempoChange || tempo;
      playBeatSound(beat);
      idx++;
      playTimeoutRef.current = window.setTimeout(playNext, (60 / currentTempo) * 1000);
    };

    playNext();
  }, [beats, tempo, playBeatSound, stopPlayback]);

  useEffect(() => {
    return () => { if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current); };
  }, []);

  // ── Smart Listening callback ─────────────────────────────────────────────────
  /**
   * Called by MicrophoneListener when a note is committed.
   * Uses selectedBeatRef (not the state) to avoid stale closures in RAF loops.
   * @param stringIndex  Guitar string index (0=e, 5=E)
   * @param fret         Fret number (-1 means blank/rest advance only)
   * @param advanceBeat  Whether to move cursor to next beat after inserting
   */
  const handleNoteCommitted = useCallback((stringIndex: number, fret: number, advanceBeat: boolean) => {
    const currentBeat = selectedBeatRef.current;  // always fresh

    setBeats(prev => {
      const next = [...prev];

      if (fret >= 0) {
        // Grow array if needed
        while (next.length <= currentBeat) next.push(createEmptyBeat());
        next[currentBeat] = {
          ...next[currentBeat],
          isPause: false,
          strings: next[currentBeat].strings.map((s, i) =>
            i === stringIndex ? fret : s
          ),
        };
      }

      if (advanceBeat && currentBeat >= next.length - 1) {
        next.push(createEmptyBeat());
      }

      return next;
    });

    if (advanceBeat) {
      const next = currentBeat + 1;
      selectedBeatRef.current = next;   // update ref immediately so next call sees it
      setSelectedBeat(next);
      setRecordingCursor(next);
    } else {
      setRecordingCursor(currentBeat);
    }
  }, []);  // no deps needed — reads live ref, writes via functional setters

  // Clear recording cursor when mic is hidden
  useEffect(() => {
    if (!showMicListener) setRecordingCursor(null);
  }, [showMicListener]);

  // ── Insert beats at end (from MelodyAnalysis) ────────────────────────────────
  const handleInsertBeats = useCallback((newBeats: Beat[]) => {
    setBeats(prev => [...prev, ...newBeats]);
  }, []);

  // ── Current beat info ────────────────────────────────────────────────────────
  const selectedBeatData = beats[selectedBeat];
  const selectedNotes = selectedBeatData ? getNotesFromBeat(selectedBeatData) : [];
  const detectedChords = detectChords(selectedNotes);

  // Split into lines
  const lines: { beats: Beat[]; offset: number }[] = [];
  for (let i = 0; i < beats.length; i += BEATS_PER_LINE) {
    lines.push({ beats: beats.slice(i, i + BEATS_PER_LINE), offset: i });
  }

  // ── PDF Export ───────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let tabHtml = '';
    for (let lineStart = 0; lineStart < beats.length; lineStart += BEATS_PER_LINE) {
      const lineBeats = beats.slice(lineStart, lineStart + BEATS_PER_LINE);
      tabHtml += '<div class="tab-line">';
      tabHtml += '<pre>';
      for (let s = 0; s < 6; s++) {
        let line = STRING_NAMES[s].padStart(2) + ' │';
        for (const beat of lineBeats) {
          if (beat.isPause) {
            line += ' ▬ ';
          } else {
            const fret = beat.strings[s];
            if (fret === null) {
              line += '---';
            } else {
              line += fret < 10 ? `-${fret}-` : `${fret}-`;
            }
          }
        }
        line += '│';
        tabHtml += line + '\n';
      }
      tabHtml += '</pre>';

      let labels = '   ';
      for (const beat of lineBeats) {
        const notes = getNotesFromBeat(beat);
        const chords = detectChords(notes);
        const label = beat.isPause ? '⏸' : (chords.length > 0 ? chords[0] : '');
        labels += label.padEnd(3);
      }
      tabHtml += `<div class="labels">${labels}</div>`;
      tabHtml += '</div>';
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; padding: 30px 40px; color: #1a1a1a; }
  h1 { font-family: 'Segoe UI', Arial, sans-serif; font-size: 22px; margin-bottom: 4px; }
  .meta { font-family: 'Segoe UI', Arial, sans-serif; color: #666; font-size: 13px; margin-bottom: 24px; }
  .tab-line { margin-bottom: 18px; page-break-inside: avoid; break-inside: avoid; }
  .tab-line pre { font-size: 13px; line-height: 1.5; margin: 0; letter-spacing: 0.5px; }
  .labels { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #555; font-weight: 600; margin-top: 2px; white-space: pre; }
  @media print {
    body { padding: 15px 25px; }
    .tab-line { page-break-inside: avoid; break-inside: avoid; }
  }
</style></head><body>
  <h1>${title}</h1>
  <div class="meta">Tempo: ${tempo} BPM · ${beats.length} tempos · Exportado em ${new Date().toLocaleDateString('pt-BR')}</div>
  ${tabHtml}
</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">Título</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="text-2xl font-bold bg-transparent border-b-2 border-primary/30 focus:border-primary outline-none text-foreground w-full pb-1 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-semibold">BPM</label>
          <input
            type="number"
            value={tempo}
            onChange={e => setTempo(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
            className="w-16 bg-secondary text-secondary-foreground rounded-lg px-2 py-1.5 text-center border border-border text-sm font-mono"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-border">
        <Button onClick={addBeat} size="sm" variant="secondary">
          <Plus className="w-4 h-4 mr-1" /> Adicionar Tempo
        </Button>
        <Button onClick={addPause} size="sm" variant="secondary">
          <Pause className="w-4 h-4 mr-1" /> Adicionar Pausa
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button onClick={isPlaying ? stopPlayback : startPlayback} size="sm" variant="default">
          {isPlaying ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
          {isPlaying ? 'Parar' : 'Tocar'}
        </Button>
        <Button onClick={() => setShowChordPanel(!showChordPanel)} size="sm" variant="outline">
          <Music className="w-4 h-4 mr-1" /> Acordes
        </Button>
        <Button
          onClick={() => setShowMicListener(!showMicListener)}
          size="sm"
          variant={showMicListener ? 'default' : 'outline'}
        >
          <Mic className="w-4 h-4 mr-1" /> Escutar
        </Button>
        <Button
          onClick={() => setShowAnalysis(!showAnalysis)}
          size="sm"
          variant={showAnalysis ? 'default' : 'outline'}
          className={showAnalysis ? '' : 'border-primary/40 text-primary hover:bg-primary/10'}
        >
          <Sparkles className="w-4 h-4 mr-1" /> Análise
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button onClick={exportPDF} size="sm" variant="outline">
          <FileDown className="w-4 h-4 mr-1" /> Exportar PDF
        </Button>
      </div>

      {/* Tablature Grid */}
      <div className="space-y-5">
        {lines.map((line, lineIdx) => (
          <div key={lineIdx} className="overflow-x-auto rounded-lg bg-card/50 border border-border/50 p-3">
            <div className="inline-flex flex-col min-w-fit">
              {/* Tempo change indicators */}
              <div className="flex items-center mb-0.5">
                <span className="w-8" />
                {line.beats.map((beat, i) => {
                  const beatIdx = line.offset + i;
                  return (
                    <div key={beatIdx} className="w-11 text-center">
                      {beat.tempoChange && (
                        <span className="text-[9px] text-accent font-bold flex items-center justify-center gap-0.5">
                          <SkipForward className="w-2.5 h-2.5" />{beat.tempoChange}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* String rows */}
              {[0, 1, 2, 3, 4, 5].map(stringIdx => (
                <div key={stringIdx} className="flex items-center h-7">
                  <span
                    className="w-7 text-right text-xs font-mono font-bold mr-0.5 shrink-0"
                    style={{ color: `hsl(var(--string-${stringIdx + 1}))` }}
                  >
                    {STRING_NAMES[stringIdx]}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">│</span>
                  {line.beats.map((beat, i) => {
                    const beatIdx = line.offset + i;
                    const isSelected = beatIdx === selectedBeat;
                    const isPlayingBeat = beatIdx === currentPlayBeat;
                    const isRecording = recordingCursor !== null && beatIdx === recordingCursor;

                    return (
                      <div
                        key={beatIdx}
                        className={`relative w-11 h-7 flex items-center justify-center cursor-pointer transition-all duration-100 border-r border-border/20 ${isPlayingBeat ? 'bg-accent/20'
                          : isRecording ? 'bg-primary/20'
                            : isSelected ? 'bg-primary/10'
                              : ''
                          } ${beat.isPause ? 'bg-muted/40' : ''}`}
                        onClick={() => setSelectedBeat(beatIdx)}
                      >
                        {/* Recording pulse ring */}
                        {isRecording && stringIdx === 0 && (
                          <span className="absolute inset-0 ring-2 ring-primary/60 rounded pointer-events-none animate-pulse z-20" />
                        )}

                        <div
                          className="tab-string-line"
                          style={{ backgroundColor: `hsl(var(--string-${stringIdx + 1}))` }}
                        />
                        {beat.isPause ? (
                          <span className="text-muted-foreground text-xs relative z-10">—</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={beat.strings[stringIdx] !== null ? beat.strings[stringIdx]!.toString() : ''}
                            onChange={e => updateFret(beatIdx, stringIdx, e.target.value)}
                            className="tab-cell-input"
                            maxLength={2}
                            onClick={e => { e.stopPropagation(); setSelectedBeat(beatIdx); }}
                          />
                        )}
                      </div>
                    );
                  })}
                  <span className="text-muted-foreground font-mono text-xs">│</span>
                </div>
              ))}

              {/* Beat numbers */}
              <div className="flex items-center mt-0.5">
                <span className="w-8" />
                {line.beats.map((_, i) => {
                  const beatIdx = line.offset + i;
                  return (
                    <div key={beatIdx} className="w-11 text-center">
                      <span className={`text-[10px] ${beatIdx === recordingCursor ? 'text-primary font-black animate-pulse'
                        : beatIdx === selectedBeat ? 'text-primary font-bold'
                          : 'text-muted-foreground'
                        }`}>
                        {beatIdx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Chord/Note labels */}
              <div className="flex items-center mt-0.5">
                <span className="w-8" />
                {line.beats.map((beat, i) => {
                  const beatIdx = line.offset + i;
                  const notes = getNotesFromBeat(beat);
                  const chords = detectChords(notes);
                  return (
                    <div key={beatIdx} className="w-11 text-center">
                      {beat.isPause ? (
                        <span className="text-[10px] text-muted-foreground">⏸</span>
                      ) : chords.length > 0 ? (
                        <button
                          className="text-[10px] text-primary font-bold hover:underline"
                          onClick={() => { setSelectedChord(chords[0]); setShowChordPanel(true); }}
                        >
                          {chords[0]}
                        </button>
                      ) : notes.length === 1 ? (
                        <span className="text-[10px] text-accent font-semibold">{notes[0].name}</span>
                      ) : notes.length > 1 ? (
                        <span className="text-[9px] text-accent">{notes.map(n => n.name).join('')}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selected beat details */}
      {selectedBeatData && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary">
              Tempo {selectedBeat + 1}
              {selectedBeatData.isPause ? ' — Pausa' : ''}
              {selectedBeatData.tempoChange ? ` — ${selectedBeatData.tempoChange} BPM` : ''}
              {recordingCursor === selectedBeat && (
                <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded animate-pulse">
                  ● Gravando
                </span>
              )}
            </h3>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => togglePause(selectedBeat)} title={selectedBeatData.isPause ? 'Remover pausa' : 'Marcar como pausa'}>
                <Pause className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => insertBeatAfter(selectedBeat)} title="Inserir tempo após">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                const notes = getNotesFromBeat(beats[selectedBeat]);
                if (notes.length) playNotes(notes.map(n => n.frequency));
                else playClick();
              }} title="Ouvir">
                <Volume2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeBeat(selectedBeat)} title="Remover">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Tempo change */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mudança de BPM:</span>
            <input
              type="number"
              value={selectedBeatData.tempoChange || ''}
              placeholder={tempo.toString()}
              onChange={e => {
                const v = parseInt(e.target.value);
                setTempoChange(selectedBeat, isNaN(v) ? undefined : Math.max(20, Math.min(300, v)));
              }}
              className="w-16 bg-secondary text-secondary-foreground rounded px-2 py-1 text-center border border-border text-xs font-mono"
            />
            {selectedBeatData.tempoChange && (
              <button
                onClick={() => setTempoChange(selectedBeat, undefined)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                limpar
              </button>
            )}
          </div>

          {/* Notes info */}
          {selectedNotes.length > 0 && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-semibold text-foreground">Notas: </span>
                {selectedNotes.map((n, i) => (
                  <span key={i} className="inline-flex items-center gap-1 mr-3">
                    <span className="font-mono text-accent font-bold">{n.name}</span>
                    <span className="text-muted-foreground text-xs">
                      ({NOTE_NAMES_PT[n.name]} · corda {STRING_NAMES[n.stringIndex]} · casa {beats[selectedBeat].strings[n.stringIndex]})
                    </span>
                  </span>
                ))}
              </div>
              {detectedChords.length > 0 && (
                <div>
                  <span className="font-semibold text-foreground">Acordes possíveis: </span>
                  {detectedChords.map((chord, i) => (
                    <button
                      key={i}
                      className="inline-block mr-2 px-2.5 py-1 bg-primary/15 text-primary rounded-lg text-sm font-bold hover:bg-primary/25 transition-colors"
                      onClick={() => { setSelectedChord(chord); setShowChordPanel(true); }}
                    >
                      {chord}
                      <span className="ml-1 text-xs opacity-60">
                        ({NOTE_NAMES_PT[chord.replace(/m.*|7.*|sus.*|add.*|dim|aug|maj.*/g, '')] || chord})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Microphone Listener */}
      {showMicListener && (
        <MicrophoneListener
          onNoteCommitted={handleNoteCommitted}
          onAddBeat={() => {
            addBeat();
            setSelectedBeat(beats.length);
          }}
          currentBeatIndex={selectedBeat}
          totalBeats={beats.length}
          tempo={tempo}
        />
      )}

      {/* Melody Analysis */}
      {showAnalysis && (
        <MelodyAnalysis
          beats={beats}
          tempo={tempo}
          onApplyTransposition={transposedBeats => {
            setBeats(transposedBeats);
            setShowAnalysis(false);
          }}
          onInsertBeats={handleInsertBeats}
          onClose={() => setShowAnalysis(false)}
        />
      )}

      {/* Chord Panel */}
      {showChordPanel && (
        <ChordPanel
          selectedChord={selectedChord}
          detectedChords={detectedChords}
          onSelectChord={setSelectedChord}
          onClose={() => setShowChordPanel(false)}
        />
      )}
    </div>
  );
};
