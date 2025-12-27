import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { PlaylistItem, LyricLine } from '../types';
import { Plus, Trash2, Play, Volume2, FileText, ListMusic, Shuffle, User, Disc, Music, X, Sparkles, Loader2, FileJson, FileType, FileDown, ChevronDown, Upload, Square } from './Icons';
import { formatTime, parseLRC, parseSRT } from '../utils/parsers';
import { generateLRC, generateSRT } from '../utils/timeUtils';
import { transcribeAudio } from '../services/geminiService';

interface PlaylistEditorProps {
    playlist: PlaylistItem[];
    setPlaylist: React.Dispatch<React.SetStateAction<PlaylistItem[]>>;
    currentTrackIndex: number;
    setCurrentTrackIndex: React.Dispatch<React.SetStateAction<number>>;
    onPlayTrack: (index: number) => void;
    onSeek: (time: number) => void;
    onStop: () => void;
    onClearPlaylist: () => void;
    currentTime: number;
    onClose: () => void;
    setLyrics: React.Dispatch<React.SetStateAction<LyricLine[]>>;
}

const PlaylistEditor: React.FC<PlaylistEditorProps> = ({ playlist, setPlaylist, currentTrackIndex, setCurrentTrackIndex, onPlayTrack, onSeek, onStop, onClearPlaylist, currentTime, onClose, setLyrics }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lyricInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetIdRef = useRef<string | null>(null);
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
    const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
    const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-2.5-flash'>('gemini-2.5-flash');

    // Auto-scroll logic for lyrics
    useEffect(() => {
        if (currentTrackIndex === -1) return;

        const activeId = `lyric-active-${currentTrackIndex}`;
        const activeEl = document.getElementById(activeId);

        if (activeEl) {
            const scrollContainer = activeEl.closest('.overflow-x-auto') as HTMLDivElement;

            if (scrollContainer) {
                const containerWidth = scrollContainer.clientWidth;
                const elLeft = activeEl.offsetLeft;
                const elWidth = activeEl.clientWidth;

                const targetScrollLeft = elLeft + (elWidth / 2) - (containerWidth / 2);

                scrollContainer.scrollTo({
                    left: targetScrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [currentTime, currentTrackIndex]);

    const handleSort = (type: 'filename' | 'artist' | 'title' | 'album' | 'random') => {
        if (playlist.length === 0) return;
        const currentItem = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;
        const sorted = [...playlist];
        let direction: 'asc' | 'desc' = 'asc';

        if (type === 'random') {
            setSortConfig({ key: 'random', direction: 'asc' });
            for (let i = sorted.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
            }
        } else {
            if (sortConfig.key === type && sortConfig.direction === 'asc') {
                direction = 'desc';
            }
            setSortConfig({ key: type, direction });
            const multiplier = direction === 'asc' ? 1 : -1;
            if (type === 'filename') sorted.sort((a, b) => multiplier * a.audioFile.name.localeCompare(b.audioFile.name));
            else if (type === 'artist') sorted.sort((a, b) => multiplier * (a.metadata.artist || '').localeCompare(b.metadata.artist || ''));
            else if (type === 'title') sorted.sort((a, b) => multiplier * (a.metadata.title || '').localeCompare(b.metadata.title || ''));
            else if (type === 'album') sorted.sort((a, b) => multiplier * (a.metadata.album || '').localeCompare(b.metadata.album || ''));
        }
        setPlaylist(sorted);
        if (currentItem) {
            const newIndex = sorted.findIndex(i => i.id === currentItem.id);
            if (newIndex !== -1) setCurrentTrackIndex(newIndex);
        }
    };

    const handleTranscribe = async (item: PlaylistItem) => {
        if (transcribingIds.has(item.id)) return;

        // Stop playback as requested when transcription starts
        onStop();

        const controller = new AbortController();
        abortControllers.current.set(item.id, controller);
        setTranscribingIds(prev => new Set(prev).add(item.id));

        try {
            let transcribedLyrics = await transcribeAudio(item.audioFile, selectedModel, controller.signal);

            const audioDuration = item.duration || 0;
            if (audioDuration > 0) {
                transcribedLyrics = transcribedLyrics
                    .map(l => {
                        const safeTime = Math.max(0, Math.min(l.time, audioDuration));
                        let safeEndTime = l.endTime;
                        if (safeEndTime !== undefined) {
                            safeEndTime = Math.max(safeTime, Math.min(safeEndTime, audioDuration));
                        }
                        return { ...l, time: safeTime, endTime: safeEndTime };
                    })
                    .filter(l => l.time < audioDuration);
            }

            const sortedLyrics = transcribedLyrics.sort((a, b) => a.time - b.time);

            setPlaylist(prev => prev.map(p =>
                p.id === item.id ? { ...p, parsedLyrics: sortedLyrics } : p
            ));

            if (playlist[currentTrackIndex]?.id === item.id) {
                setLyrics(sortedLyrics);
            }

        } catch (err: any) {
            if (err.message === "Aborted") {
                console.log(`Transcription for ${item.id} aborted.`);
            } else {
                console.error("Transcription failed:", err);
                alert("Transcription failed. Please check your API key or file format.");
            }
        } finally {
            setTranscribingIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
            abortControllers.current.delete(item.id);
        }
    };

    const handleStopTranscription = (id: string) => {
        const controller = abortControllers.current.get(id);
        if (controller) {
            controller.abort();
            abortControllers.current.delete(id);
        }
        setTranscribingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const downloadFile = (content: string, filename: string, mimeType: string) => {
        const blob = new Blob([content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportLyrics = (item: PlaylistItem, format: 'txt' | 'json' | 'srt' | 'lrc') => {
        const rawLyrics = item.parsedLyrics || [];
        if (rawLyrics.length === 0) return;

        const audioDuration = item.duration || Infinity;
        let content = "";
        const filename = `${item.metadata.title || 'lyrics'}.${format}`;

        if (format === 'txt') {
            content = rawLyrics.map(l => l.text).join("\n");
        } else if (format === 'json') {
            const sanitizedForJson = rawLyrics.map(l => ({
                ...l,
                time: Math.min(l.time, audioDuration),
                endTime: l.endTime ? Math.min(l.endTime, audioDuration) : undefined
            }));
            content = JSON.stringify(sanitizedForJson, null, 2);
        } else if (format === 'srt') {
            content = generateSRT(rawLyrics, audioDuration);
        } else if (format === 'lrc') {
            content = generateLRC(rawLyrics, item.metadata, audioDuration);
        }

        downloadFile(content, filename, 'application/octet-stream');
    };

    const handleClearLyrics = (item: PlaylistItem) => {
        setPlaylist(prev => prev.map(p =>
            p.id === item.id ? { ...p, parsedLyrics: [], lyricFile: undefined } : p
        ));

        if (playlist[currentTrackIndex]?.id === item.id) {
            setLyrics([]);
        }
    };

    const triggerManualUpload = (id: string) => {
        uploadTargetIdRef.current = id;
        lyricInputRef.current?.click();
    };

    const handleManualLyricUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const targetId = uploadTargetIdRef.current;

        try {
            if (file && targetId) {
                const text = await file.text();
                const ext = file.name.split('.').pop()?.toLowerCase();
                let parsedLyrics: LyricLine[] = [];

                if (ext === 'lrc') parsedLyrics = parseLRC(text);
                else if (ext === 'srt') parsedLyrics = parseSRT(text);

                setPlaylist(prev => prev.map(p =>
                    p.id === targetId ? { ...p, parsedLyrics, lyricFile: file } : p
                ));

                if (playlist[currentTrackIndex]?.id === targetId) {
                    setLyrics(parsedLyrics);
                }
            }
        } catch (err) {
            console.error("Failed to parse manual lyrics:", err);
            alert("Failed to load lyric file.");
        } finally {
            if (lyricInputRef.current) lyricInputRef.current.value = '';
            uploadTargetIdRef.current = null;
        }
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (selectedIndex !== null && e.key === 'Delete') {
            e.preventDefault(); e.stopPropagation();
            setPlaylist(prev => {
                const newList = [...prev];
                newList.splice(selectedIndex, 1);
                return newList;
            });
        } else if (e.key === 'ArrowDown' && playlist.length > 0) {
            e.preventDefault(); e.stopPropagation();
            setSelectedIndex(prev => prev === null ? 0 : Math.min(prev + 1, playlist.length - 1));
        } else if (e.key === 'ArrowUp' && playlist.length > 0) {
            e.preventDefault(); e.stopPropagation();
            setSelectedIndex(prev => prev === null ? 0 : Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && selectedIndex !== null) {
            e.preventDefault(); e.stopPropagation();
            onPlayTrack(selectedIndex);
        }
    }, [selectedIndex, playlist.length, setPlaylist, onPlayTrack]);

    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('keydown', handleKeyDown);
            return () => container.removeEventListener('keydown', handleKeyDown);
        }
    }, [handleKeyDown]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files: File[] = Array.from(e.target.files);
            const fileGroups = new Map<string, { audio?: File; lyric?: File }>();

            files.forEach(file => {
                const ext = file.name.split('.').pop()?.toLowerCase();
                const basename = file.name.replace(/\.[^/.]+$/, "");
                if (!fileGroups.has(basename)) fileGroups.set(basename, {});
                const group = fileGroups.get(basename)!;
                if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext || '')) group.audio = file;
                else if (['lrc', 'srt'].includes(ext || '')) group.lyric = file;
            });

            const newItems: PlaylistItem[] = [];
            const extractMetadata = async (file: File, fallbackTitle: string): Promise<{ title: string; artist: string; album?: string; coverUrl: string | null; duration: number }> => {
                return new Promise((resolve) => {
                    const jsmediatags = (window as any).jsmediatags;
                    const audio = new Audio();
                    audio.src = URL.createObjectURL(file);

                    const getDuration = () => new Promise<number>((res) => {
                        audio.onloadedmetadata = () => res(audio.duration);
                        setTimeout(() => res(0), 2000);
                    });

                    const finish = (tags: any, dur: number) => {
                        const { title, artist, album, picture } = tags || {};
                        let coverUrl: string | null = null;
                        if (picture) {
                            const { data, format } = picture;
                            let base64String = "";
                            for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
                            coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
                        }
                        URL.revokeObjectURL(audio.src);
                        resolve({
                            title: title || fallbackTitle,
                            artist: artist || 'Unknown Artist',
                            album: album || undefined,
                            coverUrl,
                            duration: dur
                        });
                    };

                    if (!jsmediatags) {
                        getDuration().then(d => finish(null, d));
                    } else {
                        jsmediatags.read(file, {
                            onSuccess: async (tag: any) => {
                                const d = await getDuration();
                                finish(tag.tags, d);
                            },
                            onError: async () => {
                                const d = await getDuration();
                                finish(null, d);
                            }
                        });
                    }
                });
            };

            for (const [basename, group] of fileGroups.entries()) {
                if (group.audio) {
                    const meta = await extractMetadata(group.audio, basename);
                    const id = Math.random().toString(36).substr(2, 9);
                    let itemParsedLyrics: LyricLine[] = [];
                    if (group.lyric) {
                        const text = await group.lyric.text();
                        const ext = group.lyric.name.split('.').pop()?.toLowerCase();
                        if (ext === 'lrc') itemParsedLyrics = parseLRC(text);
                        else if (ext === 'srt') itemParsedLyrics = parseSRT(text);
                    }
                    newItems.push({
                        id,
                        audioFile: group.audio,
                        lyricFile: group.lyric,
                        parsedLyrics: itemParsedLyrics,
                        metadata: { title: meta.title, artist: meta.artist, album: meta.album, coverUrl: meta.coverUrl },
                        duration: meta.duration
                    });
                }
            }
            if (newItems.length > 0) setPlaylist(prev => [...prev, ...newItems]);
            e.target.value = '';
        }
    };

    const removeTrack = (index: number) => {
        setPlaylist(prev => {
            const newList = [...prev];
            newList.splice(index, 1);
            return newList;
        });
    };

    return (
        <div className="w-full max-w-[100vw] h-64 flex flex-col bg-zinc-900/95 backdrop-blur-md border-t border-white/10 z-20 shadow-xl overflow-hidden outline-none">
            <input
                type="file"
                ref={lyricInputRef}
                className="hidden"
                accept=".lrc,.srt"
                onChange={handleManualLyricUpload}
            />

            <div className="p-2 border-b border-white/10 flex items-center justify-between bg-zinc-900 z-30 shrink-0 h-12">
                <div className="flex items-center gap-4 shrink-0">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-300 whitespace-nowrap">
                        <ListMusic size={16} className="text-orange-400" />
                        Playlist
                    </h2>
                    <div className="w-px h-4 bg-zinc-700"></div>

                    <label className="flex items-center gap-2 px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-xs font-medium cursor-pointer transition-colors text-white whitespace-nowrap">
                        <Plus size={14} /> Add Audio & Lyrics
                        <input type="file" className="hidden" accept="audio/*,.lrc,.srt" multiple onChange={handleFileUpload} />
                    </label>

                    <div className="w-px h-4 bg-zinc-700"></div>

                    <div className="flex items-center gap-1">
                        <button onClick={() => handleSort('filename')} className={`p-1 rounded transition-colors ${sortConfig.key === 'filename' ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-700 text-zinc-400 hover:text-white'}`} title="Sort by Filename"><FileText size={14} /></button>
                        <button onClick={() => handleSort('artist')} className={`p-1 rounded transition-colors ${sortConfig.key === 'artist' ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-700 text-zinc-400 hover:text-white'}`} title="Sort by Artist"><User size={14} /></button>
                        <button onClick={() => handleSort('title')} className={`p-1 rounded transition-colors ${sortConfig.key === 'title' ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-700 text-zinc-400 hover:text-white'}`} title="Sort by Title"><Music size={14} /></button>
                        <button onClick={() => handleSort('random')} className={`p-1 rounded transition-colors ${sortConfig.key === 'random' ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-700 text-zinc-400 hover:text-white'}`} title="Shuffle"><Shuffle size={14} /></button>
                    </div>

                    <div className="w-px h-4 bg-zinc-700"></div>

                    <div className="relative group">
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value as any)}
                            className="appearance-none bg-zinc-800/80 border border-white/10 text-zinc-300 text-[10px] font-medium rounded px-2 pr-6 h-7 focus:outline-none focus:border-orange-500 cursor-pointer hover:bg-zinc-700 transition-colors"
                            title="Select AI Model for Transcription"
                        >
                            <option value="gemini-2.5-flash" className="bg-zinc-900 text-xs">Gemini 2.5 Flash</option>
                            <option value="gemini-3-flash-preview" className="bg-zinc-900 text-xs">Gemini 3 Flash Preview</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-zinc-500">
                            <ChevronDown size={10} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 shrink-0">
                    <button onClick={() => { if (playlist.length > 0) { onClearPlaylist(); setPlaylist([]); } }} className="p-1 hover:bg-red-900/50 text-zinc-500 hover:text-red-200 rounded transition-colors" title="Clear Playlist"><Trash2 size={14} /></button>
                    <div className="w-px h-4 bg-zinc-700 mx-1 self-center"></div>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded transition-colors" title="Close Playlist"><X size={14} /></button>
                </div>
            </div>

            <div ref={containerRef} tabIndex={0} onMouseEnter={() => containerRef.current?.focus()} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-zinc-950 p-1 space-y-1 focus:outline-none">
                {playlist.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
                        <ListMusic size={32} className="mb-2 opacity-50" />
                        <p>Playlist is empty</p>
                    </div>
                ) : (
                    playlist.map((item, idx) => {
                        const isCurrent = idx === currentTrackIndex;
                        const isSelected = idx === selectedIndex;
                        const isTranscribing = transcribingIds.has(item.id);
                        const lyrics = item.parsedLyrics || [];
                        const activeLyricIndex = isCurrent ? lyrics.findIndex((l, i) => {
                            if (l.endTime !== undefined) return currentTime >= l.time && currentTime < l.endTime;
                            const next = lyrics[i + 1];
                            return currentTime >= l.time && (!next || currentTime < next.time);
                        }) : -1;

                        return (
                            <div key={item.id} onClick={() => setSelectedIndex(idx)} className={`group relative flex gap-2 p-1.5 rounded-md border transition-all cursor-pointer ${isCurrent ? 'bg-zinc-800 border-orange-500/50 shadow-lg' : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'} ${isSelected ? 'ring-2 ring-blue-500/70 ring-offset-1 ring-offset-zinc-950' : ''}`}>
                                <div className="flex flex-col gap-1 shrink-0 w-44">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onPlayTrack(idx)} className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${isCurrent ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                                            {isCurrent ? <Volume2 size={14} /> : <Play size={14} />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-xs font-medium truncate ${isCurrent ? 'text-orange-100' : 'text-zinc-300'}`}>{item.metadata.title}</div>
                                            <div className="text-[9px] text-zinc-500 truncate">{item.metadata.artist}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 h-12 bg-zinc-950/50 rounded border border-zinc-800/50 overflow-x-auto overflow-y-hidden custom-scrollbar flex items-center">
                                    {lyrics.length > 0 ? (
                                        <div className="relative h-full min-w-max flex items-center px-1">
                                            {lyrics.map((line, lIdx) => {
                                                const isActive = lIdx === activeLyricIndex;
                                                return (
                                                    <div key={lIdx} id={isActive ? `lyric-active-${idx}` : undefined} className={`flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[9px] transition-colors whitespace-nowrap cursor-pointer ${isActive ? 'bg-orange-600 text-white border border-orange-400' : 'bg-zinc-800/50 hover:bg-blue-900/50 border border-zinc-700/30 hover:border-blue-500/50 text-zinc-400'}`} onClick={(e) => { e.stopPropagation(); if (idx !== currentTrackIndex) onPlayTrack(idx); setTimeout(() => onSeek(line.time), 150); }}>
                                                        <span className={`font-mono text-[8px] ${isActive ? 'text-orange-200' : 'text-zinc-500'}`}>{formatTime(line.time)}</span>
                                                        <span className="truncate max-w-[120px]">{line.text || '♪'}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center gap-2">
                                            <span className="text-zinc-700 text-[9px] italic">No lyric timeline</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); triggerManualUpload(item.id); }}
                                        className="p-1.5 rounded bg-zinc-800/80 border border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                        title="Load Lyric File (.lrc, .srt)"
                                    >
                                        <Upload size={14} />
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isTranscribing) {
                                                handleStopTranscription(item.id);
                                            } else {
                                                handleTranscribe(item);
                                            }
                                        }}
                                        className={`p-1.5 rounded transition-colors ${isTranscribing ? 'bg-red-900/30 border-red-500/30 text-red-400 hover:bg-red-900/50' : 'bg-purple-900/30 border-purple-500/30 text-purple-400 hover:bg-purple-800/50'} border`}
                                        title={isTranscribing ? "Cancel Transcription" : `AI Sync Transcribe using ${selectedModel === 'gemini-3-flash-preview' ? 'v3' : 'v2.5'}`}
                                    >
                                        {isTranscribing ? (
                                            <div className="group/btn relative flex items-center justify-center w-3.5 h-3.5">
                                                <Loader2 size={14} className="absolute animate-spin opacity-100 group-hover/btn:opacity-0 transition-opacity" />
                                                <Square size={10} fill="currentColor" className="absolute opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                            </div>
                                        ) : (
                                            <Sparkles size={14} />
                                        )}
                                    </button>

                                    {lyrics.length > 0 && (
                                        <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded p-0.5 border border-zinc-700/50">
                                            <button onClick={(e) => { e.stopPropagation(); exportLyrics(item, 'txt'); }} className="p-1 hover:bg-white/10 rounded text-[8px] text-zinc-400 font-bold" title="Download TXT">TXT</button>
                                            <button onClick={(e) => { e.stopPropagation(); exportLyrics(item, 'lrc'); }} className="p-1 hover:bg-white/10 rounded text-[8px] text-zinc-400 font-bold" title="Download LRC">LRC</button>
                                            <button onClick={(e) => { e.stopPropagation(); exportLyrics(item, 'srt'); }} className="p-1 hover:bg-white/10 rounded text-[8px] text-zinc-400 font-bold" title="Download SRT">SRT</button>
                                            <button onClick={(e) => { e.stopPropagation(); exportLyrics(item, 'json'); }} className="p-1 hover:bg-white/10 rounded text-[8px] text-zinc-400 font-bold" title="Download JSON">JSON</button>
                                            <div className="w-px h-3 bg-zinc-700 mx-0.5"></div>
                                            <button onClick={(e) => { e.stopPropagation(); handleClearLyrics(item); }} className="p-1 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 rounded transition-colors" title="Unload Lyrics">
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    )}

                                    <button onClick={(e) => { e.stopPropagation(); removeTrack(idx); }} className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default PlaylistEditor;