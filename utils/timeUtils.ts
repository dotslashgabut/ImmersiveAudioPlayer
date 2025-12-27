
import { LyricLine } from '../types';

// Helper to pad numbers with leading zeros
const pad = (num: number, size: number): string => {
    return num.toString().padStart(size, '0');
};

/**
 * Robust timestamp parser handling numbers (seconds) or strings (MM:SS.mmm, HH:MM:SS.mmm)
 * Examples: "04:20.500", "00:04:20,500", 260.5
 */
export const parseTimestamp = (ts: unknown): number => {
    if (typeof ts === 'number') return ts;
    if (!ts || typeof ts !== 'string') return 0;

    // Replace comma with dot to ensure parseFloat handles milliseconds correctly
    const cleanTs = ts.trim().replace(',', '.');
    const parts = cleanTs.split(':');

    try {
        if (parts.length === 2) {
            // Format MM:SS.mmm
            const minutes = parseFloat(parts[0]);
            const seconds = parseFloat(parts[1]);
            return (minutes * 60) + seconds;
        } else if (parts.length === 3) {
            // Format HH:MM:SS.mmm
            const hours = parseFloat(parts[0]);
            const minutes = parseFloat(parts[1]);
            const seconds = parseFloat(parts[2]);
            return (hours * 3600) + (minutes * 60) + seconds;
        } else {
            // Raw seconds or fallback
            const val = parseFloat(cleanTs);
            return isNaN(val) ? 0 : val;
        }
    } catch (e) {
        console.warn("Could not parse timestamp:", ts);
        return 0;
    }
};

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
export const formatToSRTTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "00:00:00,000";

    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const sec = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const min = totalMinutes % 60;
    const hour = Math.floor(totalMinutes / 60);

    return `${pad(hour, 2)}:${pad(min, 2)}:${pad(sec, 2)},${pad(ms, 3)}`;
};

/**
 * Format seconds to LRC timestamp: [MM:SS.xx] (centiseconds)
 */
export const formatToLRCTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "[00:00.00]";

    const totalCentiseconds = Math.round(seconds * 100);
    const centis = totalCentiseconds % 100;
    const totalSeconds = Math.floor(totalCentiseconds / 100);
    const sec = totalSeconds % 60;
    const min = Math.floor(totalSeconds / 60);

    return `[${pad(min, 2)}:${pad(sec, 2)}.${pad(centis, 2)}]`;
};

/**
 * Format seconds to Display timestamp: MM:SS.mmm
 */
export const formatToDisplayTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "00:00.000";

    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const sec = totalSeconds % 60;
    const min = Math.floor(totalSeconds / 60);

    return `${pad(min, 2)}:${pad(sec, 2)}.${pad(ms, 3)}`;
};

export const generateSRT = (lyrics: LyricLine[], audioDuration: number = Infinity): string => {
    return lyrics.map((l, i) => {
        const startTime = Math.min(Math.max(0, l.time), audioDuration);
        // Calculate effective end: either provided endTime, or next line start, or +3s default
        let effectiveEnd = l.endTime || (lyrics[i + 1]?.time || l.time + 3);

        // Clamp end time to duration and ensure it's >= start time
        effectiveEnd = Math.max(startTime, Math.min(effectiveEnd, audioDuration));

        return `${i + 1}\n${formatToSRTTime(startTime)} --> ${formatToSRTTime(effectiveEnd)}\n${l.text}\n`;
    }).join("\n");
};

export const generateLRC = (
    lyrics: LyricLine[],
    metadata: {
        title?: string;
        artist?: string;
        album?: string;
    },
    audioDuration: number = 0
): string => {
    let lines: string[] = [];

    if (metadata.title) lines.push(`[ti:${metadata.title}]`);
    if (metadata.artist) lines.push(`[ar:${metadata.artist}]`);
    if (metadata.album) lines.push(`[al:${metadata.album}]`);
    lines.push(`[by:LyricFlow AI]`);

    for (let i = 0; i < lyrics.length; i++) {
        const current = lyrics[i];
        const next = lyrics[i + 1];

        // Add current lyric
        lines.push(`${formatToLRCTime(current.time)}${current.text}`);

        // Effective end time of current line
        let currentEnd = current.endTime || current.time + 2;
        currentEnd = Math.min(currentEnd, audioDuration);

        if (next) {
            // If gap between current vocal end and next vocal start > 4s, clear screen
            // Ensure we don't insert a clear tag past the audio duration
            if (next.time - currentEnd > 4 && currentEnd < audioDuration) {
                lines.push(`${formatToLRCTime(currentEnd)}`);
            }
        } else {
            // Last line special logic
            // If audio still has > 4s after last vocal end, clear screen after 4s
            // But strictly cap at duration
            if (audioDuration && (audioDuration - currentEnd > 4)) {
                const clearTime = Math.min(currentEnd + 4, audioDuration);
                lines.push(`${formatToLRCTime(clearTime)}`);
            }
        }
    }

    return lines.join('\n');
};
