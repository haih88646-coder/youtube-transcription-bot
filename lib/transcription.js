import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import Groq from 'groq-sdk';

const execAsync = promisify(exec);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function downloadYouTubeAudio(url) {
  if (!url) {
    throw new Error('A YouTube URL is required.');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-audio-'));

  try {
    await execAsync(
      `yt-dlp -f bestaudio --no-warnings --quiet -o "${path.join(tempDir, 'audio.%(ext)s')}" "${url}"`,
      { timeout: 60000 }
    );
  } catch (error) {
    try {
      const youtubedl = require('youtube-dl-exec').default;
      await youtubedl(url, {
        format: 'bestaudio/best',
        output: path.join(tempDir, 'audio.%(ext)s'),
        noWarnings: true,
        noPlaylist: true,
        restrictFilenames: true,
        quiet: true
      });
    } catch (fallbackError) {
      throw new Error(`Failed to download YouTube audio: ${error.message || fallbackError.message}`);
    }
  }

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

  try {
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const fileStats = await fs.stat(filePath);
    
    console.log(`File: ${fileName}, Size: ${fileStats.size} bytes (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);

    // Check file size limit (25MB for free tier)
    if (fileStats.size > 25 * 1024 * 1024) {
      throw new Error(`File is too large (${(fileStats.size / 1024 / 1024).toFixed(2)} MB). Maximum is 25 MB.`);
    }

    // Create a Blob instead of File for better compatibility
    const audioBlob = new Blob([fileBuffer], { type: getMimeType(path.extname(fileName)) });
    
    // Use fs.createReadStream for streaming upload (more efficient for large files)
    const { createReadStream } = await import('fs');
    const readStream = createReadStream(filePath);

    console.log('Sending to Groq API for transcription...');
    
    const response = await groq.audio.transcriptions.create({
      file: readStream as any,
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      language: 'en'
    });

    const text = response?.text || '';
    const segments = Array.isArray(response?.segments) ? response.segments : [];

    if (!text && segments.length === 0) {
      throw new Error('The transcription API returned an empty response.');
    }

    console.log(`Transcription successful: ${text.length} characters`);
    return { text, segments };
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
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
