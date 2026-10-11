import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Groq from 'groq-sdk';
import youtubedl from 'youtube-dl-exec';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function downloadYouTubeAudio(url) {
  if (!url) {
    throw new Error('A YouTube URL is required.');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-audio-'));

  await youtubedl(url, {
    format: 'bestaudio/best',
    output: path.join(tempDir, 'audio.%(ext)s'),
    noWarnings: true,
    noPlaylist: true,
    restrictFilenames: true,
    quiet: true
  });

  const downloadedFiles = await fs.readdir(tempDir);
  const audioFile = downloadedFiles.find((file) => /\.(mp3|m4a|wav|webm|ogg|opus|aac|flac|mp4)$/i.test(file));

  if (!audioFile) {
    throw new Error('Unable to download an audio file from the YouTube URL.');
  }

  return path.join(tempDir, audioFile);
}

export async function transcribeAudioFile(filePath) {
  if (!filePath) {
    throw new Error('A valid audio file path is required.');
  }

  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName).toLowerCase();
  const mimeType = getMimeType(extension);

  const file = new File([fileBuffer], fileName, { type: mimeType || 'audio/mpeg' });

  const response = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment']
  });

  const text = response?.text || '';
  const segments = Array.isArray(response?.segments) ? response.segments : [];

  if (!text && segments.length === 0) {
    throw new Error('The transcription API returned an empty response.');
  }

  return { text, segments };
}

export function generateTranscriptFile({ text, segments = [], format = 'txt' }) {
  const normalized = format.toLowerCase();

  if (normalized === 'srt') {
    return buildSrtFromSegments(segments, text);
  }

  return text.trim() || 'No transcript available.';
}

function buildSrtFromSegments(segments, fallbackText) {
  if (!segments || segments.length === 0) {
    return fallbackText.trim() || 'No transcript available.';
  }

  const entries = segments.map((segment, index) => {
    const start = formatTimestamp(segment.start);
    const end = formatTimestamp(segment.end);
    const textValue = (segment.text || '').trim();
    return `${index + 1}\n${start} --> ${end}\n${textValue}`;
  });

  return `${entries.join('\n\n')}\n`;
}

function formatTimestamp(secondsValue) {
  const totalSeconds = Number(secondsValue || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function getMimeType(extension) {
  const types = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.webm': 'audio/webm',
    '.mpeg': 'audio/mpeg'
  };

  return types[extension] || 'audio/mpeg';
}
