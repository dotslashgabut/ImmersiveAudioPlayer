import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { PlaylistItem, LyricLine } from '../types';
import { Plus, Trash2, Play, Volume2, FileText, ListMusic, Shuffle, User, Disc, Music, X, Sparkles, Loader2, FileJson, FileType, FileDown, ChevronDown, Upload, Square } from './Icons';
import { formatTime, parseLRC, parseSRT } from '../utils/parsers';
import { generateLRC, generateSRT, formatToDisplayTime } from '../utils/timeUtils';
import { transcribeAudio } from '../services/geminiService';

interface PlaylistEditorProps {
    playlist: PlaylistItem[];
    setPlaylist: React.Dispatch<React.SetStateAction<PlaylistItem[]>>;
    currentTrackIndex: number;
    setCurrentTrackIndex: React.Dispatch<React.SetStateAction<number>>;
    onPlayTrack: (index: number) => void;
    onSeek: (time: number) => void;
    onClearPlaylist: () => void;
    currentTime: number;
    onClose: () => void;
    setLyrics: React.Dispatch<React.SetStateAction<LyricLine[]>>;
}

const PlaylistEditor: React.FC<PlaylistEditorProps> = ({ playlist, setPlaylist, currentTrackIndex, setCurrentTrackIndex, onPlayTrack, onSeek, onClearPlaylist, currentTime, onClose, setLyrics }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lyricInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetIdRef = useRef<string | null>(null);
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
    const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
    const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-2.5-flash'>('gemini-2.5-flash');

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
                scrollContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
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
            if (sortConfig.key === type && sortConfig.direction === 'asc') direction = 'desc';
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
        const controller = new AbortController();
        abortControllers.current.set(item.id, controller);
        setTranscribingIds(prev => new Set(prev).add(item.id));

        try {
            const result = await transcribeAudio(item.audioFile, selectedModel, controller.signal);
            const mappedLyrics: LyricLine[] = result.map(s => ({
                time: s.start,
                endTime: s.end,
                text: s.text
            }));

            setPlaylist(prev => prev.map(p =>
                p.id === item.id ? { ...p, parsedLyrics: mappedLyrics } : p
            ));

            if (playlist[currentTrackIndex]?.id === item.id) {
                setLyrics(mappedLyrics);
            }
        } catch (err: any) {
            if (err.message !== "Aborted") {
                console.error("Transcription failed:", err);
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
        abortControllers.current.get(id)?.abort();
    };

    const exportLyrics = (item: PlaylistItem, format: 'txt' | 'json' | 'srt' | 'lrc') => {
        const rawLyrics = item.parsedLyrics || [];
        if (rawLyrics.length === 0) return;
        const audioDuration = item.duration || 0;
        let content = "";
        if (format === 'txt') content = rawLyrics.map(l => l.text).join("\n");
        else if (format === 'json') content = JSON.stringify(rawLyrics, null, 2);
        else if (format === 'srt') {
            content = generateSRT(rawLyrics.map(l => ({ start: l.time, end: l.endTime || l.time + 3, text: l.text })));
        } else if (format === 'lrc') {
            content = generateLRC(rawLyrics.map(l => ({ start: l.time, end: l.endTime || l.time + 3, text: l.text })), item.metadata, audioDuration);
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${item.metadata.title}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClearLyrics = (item: PlaylistItem) => {
        setPlaylist(prev => prev.map(p => p.id === item.id ? { ...p, parsedLyrics: [], lyricFile: undefined } : p));
        if (playlist[currentTrackIndex]?.id === item.id) setLyrics([]);
    };

    const triggerManualUpload = (id: string) => {
        uploadTargetIdRef.current = id;
        lyricInputRef.current?.click();
    };

    const handleManualLyricUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const targetId = uploadTargetIdRef.current;
        if (file && targetId) {
            const text = await file.text();
            const ext = file.name.split('.').pop()?.toLowerCase();
            const parsed = ext === 'lrc' ? parseLRC(text) : parseSRT(text);
            setPlaylist(prev => prev.map(p => p.id === targetId ? { ...p, parsedLyrics: parsed, lyricFile: file } : p));
            if (playlist[currentTrackIndex]?.id === targetId) setLyrics(parsed);
        }
        e.target.value = '';
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const newItems: PlaylistItem[] = [];
            for (const file of files) {
                if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(file.name.split('.').pop()?.toLowerCase() || '')) {
                    const jsmediatags = (window as any).jsmediatags;
                    const id = Math.random().toString(36).substr(2, 9);
                    newItems.push({
                        id,
                        audioFile: file,
                        metadata: { title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Unknown Artist', coverUrl: null },
                        parsedLyrics: []
                    });
                }
            }
            setPlaylist(prev => [...prev, ...newItems]);
            e.target.value = '';
        }
    };

    return (
        <div className="w-full h-64 flex flex-col bg-zinc-900 border-t border-white/10 z-20 shadow-xl overflow-hidden outline-none">
            <input type="file" ref={lyricInputRef} className="hidden" accept=".lrc,.srt" onChange={handleManualLyricUpload} />
            <div className="p-2 border-b border-white/10 flex items-center justify-between bg-zinc-900 z-30 shrink-0 h-12">
                <div className="flex items-center gap-4 shrink-0">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-300 whitespace-nowrap">
                        <ListMusic size={16} className="text-orange-400" /> Playlist
                    </h2>
                    <label className="flex items-center gap-2 px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-xs font-medium cursor-pointer transition-colors text-white whitespace-nowrap">
                        <Plus size={14} /> Add Files
                        <input type="file" className="hidden" accept="audio/*,.lrc,.srt" multiple onChange={handleFileUpload} />
                    </label>
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleSort('filename')} className="p-1 rounded hover:bg-zinc-700 text-zinc-400"><FileText size={14} /></button>
                        <button onClick={() => handleSort('random')} className="p-1 rounded hover:bg-zinc-700 text-zinc-400"><Shuffle size={14} /></button>
                    </div>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-zinc-700 text-zinc-400 rounded"><X size={14} /></button>
            </div>
            <div ref={containerRef} tabIndex={0} className="flex-1 overflow-y-auto custom-scrollbar bg-zinc-950 p-1 space-y-1">
                {playlist.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
                        <ListMusic size={32} className="mb-2 opacity-50" />
                        <p>Playlist is empty</p>
                    </div>
                ) : (
                    playlist.map((item, idx) => {
                        const isCurrent = idx === currentTrackIndex;
                        const isTranscribing = transcribingIds.has(item.id);
                        return (
                            <div key={item.id} className={`group flex gap-2 p-1.5 rounded-md border transition-all cursor-pointer ${isCurrent ? 'bg-zinc-800 border-orange-500/50' : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800'}`}>
                                <div className="flex-1 min-w-0" onClick={() => onPlayTrack(idx)}>
                                    <div className="text-xs font-medium truncate text-zinc-300">{item.metadata.title}</div>
                                    <div className="text-[9px] text-zinc-500">{item.metadata.artist}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); triggerManualUpload(item.id); }} className="p-1.5 rounded bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white transition-colors"><Upload size={14} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); isTranscribing ? handleStopTranscription(item.id) : handleTranscribe(item); }} className={`p-1.5 rounded border ${isTranscribing ? 'border-red-500/30 text-red-400' : 'border-purple-500/30 text-purple-400'}`}>
                                        {isTranscribing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setPlaylist(prev => prev.filter((_, i) => i !== idx)); }} className="p-1.5 text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
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