import React, { useState, useMemo, useCallback } from 'react';
import {
    Beat, NOTE_NAMES, NOTE_NAMES_PT, NOTE_NAMES_DISPLAY, SCALES,
    detectKey, KeyMatch, harmonySuggestions, ProgressionSuggestion,
    melodyIdeas, MelodyVariation, transposeBeats, getScaleNotes,
    getNotesFromBeat, getChordFingering, STRING_NAMES, createEmptyBeat,
    getScalePositions, chordToPlayableBeat, ScalePosition
} from '@/lib/music';
import { playNotes, playClick } from '@/lib/audio';
import { ChordDiagram } from './ChordDiagram';
import {
    X, ChevronDown, ChevronRight, Sparkles, Music, GitBranch,
    BarChart2, Lightbulb, Play, ArrowLeftRight, CheckCircle2, Info,
    PlusCircle, RefreshCw, Guitar
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MelodyAnalysisProps {
    beats: Beat[];
    tempo: number;
    onApplyTransposition: (transposedBeats: Beat[]) => void;
    onInsertBeats: (newBeats: Beat[]) => void;
    onClose: () => void;
}

// ── Mini tablature renderer (text-based, compact) ──────────────────────────
function MiniTab({ beats, maxBeats = 8 }: { beats: Beat[]; maxBeats?: number }) {
    const slice = beats.slice(0, maxBeats);
    if (slice.length === 0) return <span className="text-xs text-muted-foreground italic">vazio</span>;

    return (
        <div className="font-mono text-[10px] leading-4 overflow-x-auto bg-background/60 rounded p-1.5 select-none">
            {[0, 1, 2, 3, 4, 5].map(s => (
                <div key={s} className="flex items-center whitespace-nowrap">
                    <span className="w-4 text-muted-foreground">{STRING_NAMES[s]}</span>
                    <span className="text-muted-foreground">│</span>
                    {slice.map((beat, i) => {
                        if (beat.isPause) return <span key={i} className="w-7 text-center text-muted-foreground">──</span>;
                        const f = beat.strings[s];
                        const display = f === null ? '──' : f < 10 ? `─${f}─` : `${f}─`;
                        return (
                            <span key={i} className="w-7 text-center" style={{
                                color: f !== null ? `hsl(var(--string-${s + 1}))` : undefined,
                                opacity: f === null ? 0.3 : 1
                            }}>
                                {display}
                            </span>
                        );
                    })}
                    <span className="text-muted-foreground">│</span>
                </div>
            ))}
        </div>
    );
}

// ── Collapsible section wrapper ──────────────────────────────────────────────
function Section({
    icon, title, badge, defaultOpen = true, children
}: {
    icon: React.ReactNode;
    title: string;
    badge?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-border/70 rounded-xl overflow-hidden">
            <button
                className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/40 transition-colors"
                onClick={() => setOpen(o => !o)}
            >
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                    {icon}
                    {title}
                    {badge && (
                        <span className="ml-1 px-1.5 py-0.5 bg-primary/15 text-primary rounded text-[10px] font-mono">
                            {badge}
                        </span>
                    )}
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            {open && <div className="p-4 space-y-3 bg-card/40">{children}</div>}
        </div>
    );
}

// ── Fretboard scale diagram ─────────────────────────────────────────────────
// Shows notes of a scale on a 12-fret mini fretboard grid
const DEGREE_COLORS = [
    '#f59e0b', // root — amber/primary
    '#60a5fa', // 2nd
    '#34d399', // 3rd
    '#f87171', // 4th
    '#a78bfa', // 5th
    '#fb923c', // 6th
    '#38bdf8', // 7th
];

function ScaleFretboard({
    positions, fretRange = 12, highlightedNotes
}: {
    positions: ScalePosition[];
    fretRange?: number;
    highlightedNotes?: Set<string>; // notes that appear in the tablature
}) {
    const CELL_W = 28;
    const CELL_H = 18;
    const LABEL_W = 16;
    if (positions.length === 0) return null;

    return (
        <div className="overflow-x-auto">
            <div
                className="inline-grid text-[9px] font-mono select-none"
                style={{ gridTemplateColumns: `${LABEL_W}px repeat(${fretRange + 1}, ${CELL_W}px)` }}
            >
                {/* Header: fret numbers */}
                <span className="text-muted-foreground" />
                {Array.from({ length: fretRange + 1 }, (_, f) => (
                    <span key={f} className="text-center text-muted-foreground px-0.5">
                        {f === 0 ? '' : f % 3 === 0 ? f : '·'}
                    </span>
                ))}

                {/* Strings */}
                {[0, 1, 2, 3, 4, 5].map(s => (
                    <React.Fragment key={s}>
                        <span
                            className="flex items-center justify-end pr-1 font-bold"
                            style={{ color: `hsl(var(--string-${s + 1}))` }}
                        >
                            {STRING_NAMES[s]}
                        </span>
                        {Array.from({ length: fretRange + 1 }, (_, f) => {
                            const pos = positions.find(p => p.stringIndex === s && p.fret === f);
                            const isInTab = pos && highlightedNotes?.has(pos.noteName);
                            return (
                                <div
                                    key={f}
                                    className="flex items-center justify-center border-l border-border/20"
                                    style={{ height: CELL_H }}
                                >
                                    {f === 0 && (
                                        // Nut line
                                        <div className="w-full h-full border-r-2 border-foreground/30" />
                                    )}
                                    {pos ? (
                                        <div
                                            className="w-5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold relative z-10"
                                            style={{
                                                backgroundColor: DEGREE_COLORS[pos.degreeIndex % DEGREE_COLORS.length],
                                                color: '#000',
                                                outline: isInTab ? '2px solid white' : undefined,
                                            }}
                                            title={`${pos.noteName} (grau ${pos.degreeIndex + 1}) — corda ${STRING_NAMES[s]}, casa ${f}`}
                                        >
                                            {pos.isRoot ? 'R' : pos.degreeIndex + 1}
                                        </div>
                                    ) : (
                                        <div className="w-full border-b border-border/15" style={{ height: 1, marginTop: CELL_H / 2 }} />
                                    )}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-1.5 mt-2">
                {DEGREE_COLORS.slice(0, 7).map((color, i) => (
                    <span key={i} className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        {i === 0 ? 'Raiz' : `${i + 1}°`}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ── Component ────────────────────────────────────────────────────────────────
export const MelodyAnalysis: React.FC<MelodyAnalysisProps> = ({
    beats,
    tempo,
    onApplyTransposition,
    onInsertBeats,
    onClose,
}) => {
    const [selectedTransposition, setSelectedTransposition] = useState<number | null>(null);
    const [selectedProgressionIdx, setSelectedProgressionIdx] = useState(0);
    const [playingVariation, setPlayingVariation] = useState<string | null>(null);
    const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
    const [selectedScaleName, setSelectedScaleName] = useState<string | null>(null);

    // ── Derived data ──────────────────────────────────────────────────────────
    const noteBeats = useMemo(() => beats.filter(b => !b.isPause && b.strings.some(f => f !== null)), [beats]);

    const keyMatches = useMemo(() => detectKey(beats), [beats]);
    const topKey = keyMatches[0] as KeyMatch | undefined;

    const transpositions = useMemo(() => {
        return Array.from({ length: 13 }, (_, i) => {
            const semitones = i - 6; // -6 to +6
            const transposed = transposeBeats(beats, semitones);
            const maxFret = transposed.flatMap(b => b.strings).filter(f => f !== null).reduce((m, f) => Math.max(m, f!), 0);
            const outOfRange = transposed.some(b => b.strings.some(f => f !== null && (f < 0 || f > 24)));
            const rootMidi = topKey ? (topKey.root + semitones + 12 * 10) % 12 : null;
            const rootName = rootMidi !== null ? NOTE_NAMES[rootMidi] : null;
            return { semitones, transposed, maxFret, outOfRange, rootName };
        });
    }, [beats, topKey]);

    const progressions = useMemo(() => {
        if (!topKey) return [];
        return harmonySuggestions(topKey.root, topKey.quality);
    }, [topKey]);

    const variations = useMemo(() => {
        if (noteBeats.length === 0) return [];
        return melodyIdeas(beats);
    }, [beats, noteBeats]);

    // Scale fit analysis per mode
    const scaleFits = useMemo(() => {
        if (!topKey) return [];
        return SCALES.map(scale => {
            const scaleNoteSet = new Set(getScaleNotes(topKey.root, scale.name));
            const allNotes = beats.flatMap(b => getNotesFromBeat(b)).map(n => ((n.midi % 12) + 12) % 12);
            const total = allNotes.length;
            if (total === 0) return { scale, fit: 0, inScale: [], outOf: [] };
            const inScale = allNotes.filter(n => scaleNoteSet.has(n));
            const fit = Math.round((inScale.length / total) * 100);
            const inScaleNames = [...new Set(inScale)].map(n => NOTE_NAMES[n]);
            const outOfNames = [...new Set(allNotes.filter(n => !scaleNoteSet.has(n)))].map(n => NOTE_NAMES[n]);
            return { scale, fit, inScaleNames, outOfNames };
        }).sort((a, b) => b.fit - a.fit);
    }, [beats, topKey]);

    // ── Play helpers ──────────────────────────────────────────────────────────
    const playBeats = useCallback((bts: Beat[], label: string) => {
        setPlayingVariation(label);
        const beatDuration = 60 / tempo;
        let time = 0;
        const timeouts: number[] = [];
        bts.slice(0, 16).forEach(beat => {
            const t = window.setTimeout(() => {
                if (beat.isPause) { playClick(); return; }
                const freqs = getNotesFromBeat(beat).map(n => n.frequency);
                if (freqs.length > 0) playNotes(freqs, beatDuration * 0.9);
                else playClick();
            }, time);
            timeouts.push(t);
            time += beatDuration * 1000;
        });
        const end = window.setTimeout(() => setPlayingVariation(null), time + 500);
        timeouts.push(end);
    }, [tempo]);

    // ── Empty state ───────────────────────────────────────────────────────────
    const isEmpty = noteBeats.length === 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="bg-card rounded-xl border border-border space-y-0 overflow-hidden animate-in fade-in duration-200">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-foreground">Análise da Melodia</h2>
                        <p className="text-xs text-muted-foreground">{beats.length} tempos · {noteBeats.length} com notas</p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {isEmpty && (
                <div className="p-8 text-center space-y-2">
                    <Info className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground text-sm">Adicione notas à tablatura para ver a análise.</p>
                </div>
            )}

            {!isEmpty && (
                <div className="p-4 space-y-4">

                    {/* ── 1. Key Detection ─────────────────────────────────────────── */}
                    <Section icon={<BarChart2 className="w-4 h-4" />} title="Tonalidade Detectada" badge={topKey?.label}>
                        <div className="space-y-2">
                            {keyMatches.slice(0, 4).map((km, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                                        }`}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className={`text-sm font-bold ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                {km.label}
                                            </span>
                                            <span className="text-xs text-muted-foreground font-mono">{km.score}%</span>
                                        </div>
                                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${i === 0 ? 'bg-primary' : 'bg-secondary-foreground/30'}`}
                                                style={{ width: `${km.score}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {topKey && (
                            <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Notas presentes</p>
                                    <div className="flex flex-wrap gap-1">
                                        {topKey.matchedNotes.map(n => (
                                            <span key={n} className="px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded text-xs font-mono font-bold">
                                                {n} <span className="opacity-60 text-[9px]">({NOTE_NAMES_PT[n]})</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Notas ausentes</p>
                                    <div className="flex flex-wrap gap-1">
                                        {topKey.missingNotes.length === 0 ? (
                                            <span className="text-xs text-green-400 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Completa
                                            </span>
                                        ) : topKey.missingNotes.map(n => (
                                            <span key={n} className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-xs font-mono">
                                                {n}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* ── 2. Transpositions ─────────────────────────────────────────── */}
                    <Section
                        icon={<ArrowLeftRight className="w-4 h-4" />}
                        title="Variações em Outros Tons"
                        badge={`${transpositions.length} transposições`}
                        defaultOpen={false}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {transpositions.map(({ semitones, transposed, maxFret, outOfRange, rootName }) => {
                                const label = semitones === 0
                                    ? 'Original'
                                    : semitones > 0
                                        ? `+${semitones} semitons`
                                        : `${semitones} semitons`;
                                const isSelected = selectedTransposition === semitones;
                                const diffColor = maxFret <= 7 ? 'text-green-400' : maxFret <= 14 ? 'text-yellow-400' : 'text-red-400';

                                return (
                                    <div
                                        key={semitones}
                                        onClick={() => setSelectedTransposition(isSelected ? null : semitones)}
                                        className={`rounded-lg border p-2 cursor-pointer transition-all space-y-1.5 ${outOfRange
                                            ? 'border-border/30 opacity-40 cursor-not-allowed'
                                            : isSelected
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                                : 'border-border/60 hover:border-border bg-background/40'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-foreground">{label}</span>
                                            {rootName && (
                                                <span className="text-[10px] font-mono text-primary font-bold">
                                                    {rootName}{topKey?.quality === 'minor' ? 'm' : ''}
                                                </span>
                                            )}
                                        </div>
                                        <MiniTab beats={transposed} maxBeats={6} />
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-mono ${diffColor}`}>
                                                max casa {maxFret}
                                            </span>
                                            {outOfRange && <span className="text-[10px] text-red-400">fora do alcance</span>}
                                            {!outOfRange && isSelected && (
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    className="h-5 text-[10px] px-2 py-0"
                                                    onClick={e => { e.stopPropagation(); onApplyTransposition(transposed); }}
                                                >
                                                    Aplicar
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── 3. Scale Variations ──────────────────────────────────────────── */}
                    {topKey && (
                        <Section
                            icon={<GitBranch className="w-4 h-4" />}
                            title="Variações de Escala"
                            badge={topKey.rootName}
                            defaultOpen={false}
                        >
                            <p className="text-xs text-muted-foreground mb-2">
                                Compatibilidade das suas notas com cada escala em{' '}
                                <strong className="text-foreground">{topKey.rootName}</strong>.
                                Clique em uma escala para ver as posições no braço:
                            </p>
                            <div className="space-y-1.5">
                                {scaleFits.slice(0, 8).map(({ scale, fit, inScaleNames, outOfNames }) => {
                                    const isExpanded = selectedScaleName === scale.name;
                                    const scalePositions = isExpanded
                                        ? getScalePositions(topKey.root, scale.name, 12)
                                        : [];
                                    const tabNotes = new Set(
                                        beats.flatMap(b => b.strings.map((f, si) => {
                                            if (f === null) return null;
                                            // STRING_MIDI_BASE = [64, 59, 55, 50, 45, 40] (e, B, G, D, A, E)
                                            const baseMidi = [64, 59, 55, 50, 45, 40][si];
                                            const midi = baseMidi + f;
                                            return NOTE_NAMES[((midi % 12) + 12) % 12];
                                        })).filter(Boolean) as string[]
                                    );

                                    return (
                                        <div key={scale.name}
                                            className={`rounded-lg border transition-colors cursor-pointer ${isExpanded ? 'border-primary/50 bg-primary/5' : 'border-border/30 hover:border-border/60'
                                                }`}
                                        >
                                            <button
                                                className="w-full flex items-center justify-between gap-2 p-2"
                                                onClick={() => setSelectedScaleName(isExpanded ? null : scale.name)}
                                            >
                                                <div className="text-left">
                                                    <span className="text-xs font-semibold text-foreground">{scale.label}</span>
                                                    <span className="ml-2 text-[10px] text-muted-foreground">{scale.description}</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className={`text-xs font-mono font-bold ${fit >= 80 ? 'text-green-400' : fit >= 60 ? 'text-yellow-400' : 'text-red-400'
                                                        }`}>
                                                        {fit}%
                                                    </span>
                                                    {isExpanded
                                                        ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                                        : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                                                </div>
                                            </button>
                                            <div className="h-1 bg-secondary rounded-full overflow-hidden mx-2 mb-1">
                                                <div
                                                    className={`h-full rounded-full ${fit >= 80 ? 'bg-green-500' : fit >= 60 ? 'bg-yellow-500' : 'bg-red-500/60'
                                                        }`}
                                                    style={{ width: `${fit}%` }}
                                                />
                                            </div>
                                            {outOfNames && outOfNames.length > 0 && (
                                                <p className="text-[10px] text-muted-foreground px-2 pb-1">
                                                    Fora: <span className="text-red-400 font-mono">{outOfNames.join(', ')}</span>
                                                </p>
                                            )}
                                            {/* Fretboard diagram — shown when expanded */}
                                            {isExpanded && (
                                                <div className="px-2 pb-3 pt-1 border-t border-border/30">
                                                    <p className="text-[10px] text-muted-foreground mb-1.5">
                                                        Notas com <span className="font-bold text-white">anel branco</span> já aparecem na sua tablatura.
                                                    </p>
                                                    <ScaleFretboard
                                                        positions={scalePositions}
                                                        fretRange={12}
                                                        highlightedNotes={tabNotes}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {/* ── 4. Harmony Suggestions ──────────────────────────────────── */}
                    {topKey && progressions.length > 0 && (
                        <Section
                            icon={<Music className="w-4 h-4" />}
                            title="Sugestões de Harmonia"
                            badge={`${progressions.length} progressões`}
                            defaultOpen={false}
                        >
                            {/* Progression tabs */}
                            <div className="flex flex-wrap gap-1 border-b border-border pb-2 mb-3">
                                {progressions.map((p, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedProgressionIdx(i)}
                                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${selectedProgressionIdx === i
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                            }`}
                                    >
                                        {p.name.split('(')[0].trim()}
                                    </button>
                                ))}
                            </div>

                            {progressions[selectedProgressionIdx] && (() => {
                                const prog = progressions[selectedProgressionIdx];
                                return (
                                    <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">{prog.description}</p>
                                        <div className="flex flex-wrap gap-4 items-start">
                                            {prog.chords.filter(Boolean).map((chord, i) => {
                                                const fingering = getChordFingering(chord.name);
                                                return (
                                                    <div key={i} className="flex flex-col items-center gap-1">
                                                        <div className="text-[10px] text-muted-foreground font-mono font-bold">{chord.degree}</div>
                                                        {fingering ? (
                                                            <ChordDiagram chord={fingering} size="sm" />
                                                        ) : (
                                                            <div className="w-14 h-16 rounded bg-secondary flex items-center justify-center">
                                                                <span className="text-xs text-muted-foreground font-mono">{chord.name}</span>
                                                            </div>
                                                        )}
                                                        <div className="text-xs font-bold text-foreground">{chord.name}</div>
                                                        <div className="text-[10px] text-muted-foreground">{chord.function}</div>
                                                        <div className="text-[9px] font-mono text-accent/70">{chord.notes.join('–')}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Progression diagram */}
                                        <div className="bg-secondary/40 rounded-lg p-3 flex items-center justify-center gap-2 flex-wrap">
                                            {prog.chords.filter(Boolean).map((chord, i) => (
                                                <React.Fragment key={i}>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] text-muted-foreground">{chord.degree}</span>
                                                        <span className="text-sm font-bold text-primary">{chord.name}</span>
                                                    </div>
                                                    {i < prog.chords.filter(Boolean).length - 1 && (
                                                        <span className="text-muted-foreground text-lg">→</span>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>

                                        {/* Insert into tablature */}
                                        <div className="flex justify-end">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="h-7 text-xs px-3 gap-1.5"
                                                onClick={() => {
                                                    const newBeats = prog.chords
                                                        .filter(Boolean)
                                                        .map(chord => chordToPlayableBeat(chord.name, chord.notes));
                                                    onInsertBeats(newBeats);
                                                }}
                                                title="Adiciona cada acorde desta progressão como um tempo na tablatura"
                                            >
                                                <Guitar className="w-3.5 h-3.5" />
                                                Inserir acordes na tablatura
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </Section>
                    )}

                    {/* ── 5. Melody Ideas ──────────────────────────────────────────── */}
                    {variations.length > 0 && (
                        <Section
                            icon={<Lightbulb className="w-4 h-4" />}
                            title="Ideias para Melodia"
                            badge={`${variations.length} variações`}
                            defaultOpen={false}
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {variations.map(variation => {
                                    const isPlaying = playingVariation === variation.name;
                                    const isConfirming = confirmReplace === variation.name;
                                    const hasValidNotes = variation.beats.some(
                                        b => !b.isPause && b.strings.some(f => f !== null && f >= 0 && f <= 24)
                                    );

                                    return (
                                        <div
                                            key={variation.name}
                                            className="border border-border/60 rounded-lg p-3 space-y-2 bg-background/40"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-bold text-foreground">{variation.name}</p>
                                                    <p className="text-[11px] text-muted-foreground">{variation.description}</p>
                                                </div>
                                                {hasValidNotes && (
                                                    <Button
                                                        size="sm"
                                                        variant={isPlaying ? 'destructive' : 'outline'}
                                                        className="shrink-0 h-7 text-xs px-2"
                                                        onClick={() => {
                                                            if (isPlaying) { setPlayingVariation(null); return; }
                                                            playBeats(variation.beats, variation.name);
                                                        }}
                                                    >
                                                        <Play className={`w-3 h-3 mr-1 ${isPlaying ? 'animate-pulse' : ''}`} />
                                                        {isPlaying ? 'Tocando...' : 'Ouvir'}
                                                    </Button>
                                                )}
                                            </div>
                                            <MiniTab beats={variation.beats} maxBeats={8} />
                                            <div className="flex items-center justify-between gap-1 flex-wrap">
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    {variation.beats.length} tempos
                                                </span>
                                                <div className="flex gap-1">
                                                    {/* Insert at end — safe, no confirmation needed */}
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-6 text-[10px] px-2 py-0 gap-1"
                                                        onClick={() => onInsertBeats(variation.beats)}
                                                        title="Adiciona os tempos da variação ao final da tablatura"
                                                    >
                                                        <PlusCircle className="w-3 h-3" />
                                                        Inserir no final
                                                    </Button>
                                                    {/* Replace all — needs confirmation */}
                                                    {isConfirming ? (
                                                        <>
                                                            <span className="text-[10px] text-yellow-400 flex items-center">Confirmar?</span>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                className="h-6 text-[10px] px-2 py-0"
                                                                onClick={() => {
                                                                    onApplyTransposition(variation.beats);
                                                                    setConfirmReplace(null);
                                                                }}
                                                            >
                                                                Sim
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 text-[10px] px-2 py-0"
                                                                onClick={() => setConfirmReplace(null)}
                                                            >
                                                                Não
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 text-[10px] px-2 py-0 text-muted-foreground hover:text-foreground gap-1"
                                                            onClick={() => setConfirmReplace(variation.name)}
                                                            title="Substitui toda a tablatura por esta variação"
                                                        >
                                                            <RefreshCw className="w-3 h-3" />
                                                            Substituir tudo
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                </div>
            )}
        </div>
    );
};
