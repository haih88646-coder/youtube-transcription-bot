import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

import { downloadYouTubeAudio, transcribeAudioFile, generateTranscriptFile } from '@/lib/transcription';
import { sendTelegramDocument } from '@/lib/telegram';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const youtubeUrl = (formData.get('youtubeUrl') || '').toString().trim();
    const outputFormat = (formData.get('format') || 'txt').toString().toLowerCase();
    const chatId = (formData.get('chatId') || process.env.TELEGRAM_CHAT_ID || '').toString().trim();
    const uploadedFile = formData.get('file');

    if (!youtubeUrl && !uploadedFile) {
      return Response.json(
        { error: 'Please provide a YouTube URL or upload an MP3/MP4 file.' },
        { status: 400 }
      );
    }

    let tempFilePath = null;
    let tempDirPath = null;
    let finalFileName = `transcript.${outputFormat}`;

    try {
      if (youtubeUrl) {
        console.log('Downloading YouTube audio from:', youtubeUrl);
        tempFilePath = await downloadYouTubeAudio(youtubeUrl);
        tempDirPath = path.dirname(tempFilePath);
      } else if (uploadedFile) {
        console.log('Processing uploaded file:', uploadedFile.name);
        const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
        tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'transcript-'));
        const safeName = uploadedFile.name || `upload-${randomUUID()}`;
        tempFilePath = path.join(tempDirPath, safeName);
        await fs.writeFile(tempFilePath, fileBuffer);
      }

      if (!tempFilePath) {
        throw new Error('No audio file to transcribe.');
      }

      console.log('Starting transcription for:', tempFilePath);
      const { text, segments } = await transcribeAudioFile(tempFilePath);
      console.log('Transcription completed, text length:', text.length);

      const transcriptBuffer = generateTranscriptFile({ text, segments, format: outputFormat });
      finalFileName = `transcript-${Date.now()}.${outputFormat}`;

      let sentToTelegram = false;
      if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
        console.log('Sending to Telegram chat:', chatId);
        const result = await sendTelegramDocument({
          chatId,
          filename: finalFileName,
          content: transcriptBuffer,
          contentType: 'text/plain',
          caption: `Transcription ${outputFormat.toUpperCase()} file`
        });
        sentToTelegram = result.ok !== false;
      }

      return Response.json({
        success: true,
        text,
        filename: finalFileName,
        format: outputFormat,
        sentToTelegram,
        chatId,
        message: sentToTelegram
          ? 'Transcription created and sent to Telegram.'
          : 'Transcription created successfully.'
      });
    } finally {
      // Cleanup temp files
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (error) {
          console.error('Failed to delete temp file:', error.message);
        }
      }
      if (tempDirPath) {
        try {
          await fs.rm(tempDirPath, { recursive: true, force: true });
        } catch (error) {
          console.error('Failed to delete temp directory:', error.message);
        }
      }
    }
  } catch (error) {
    console.error('Transcribe route error:', error);
    return Response.json(
      {
        error: error.message || 'Failed to transcribe file.',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
