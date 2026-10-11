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
      return Response.json({ error: 'Please provide a YouTube URL or upload an MP3/MP4 file.' }, { status: 400 });
    }

    let tempFilePath = null;
    let finalFileName = `transcript.${outputFormat}`;

    try {
      if (youtubeUrl) {
        tempFilePath = await downloadYouTubeAudio(youtubeUrl);
      } else {
        const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
        const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'transcript-'));
        const safeName = uploadedFile.name || `upload-${randomUUID()}`;
        tempFilePath = path.join(folder, safeName);
        await fs.writeFile(tempFilePath, fileBuffer);
      }

      const { text, segments } = await transcribeAudioFile(tempFilePath);
      const transcriptBuffer = generateTranscriptFile({ text, segments, format: outputFormat });
      finalFileName = `transcript-${Date.now()}.${outputFormat}`;

      let sentToTelegram = false;
      if (chatId) {
        const result = await sendTelegramDocument({
          chatId,
          filename: finalFileName,
          content: transcriptBuffer,
          contentType: outputFormat === 'srt' ? 'text/plain' : 'text/plain',
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
        message: sentToTelegram ? 'Transcription created and sent to Telegram.' : 'Transcription created successfully.'
      });
    } finally {
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (error) {
          // no-op
        }
      }
    }
  } catch (error) {
    console.error('transcribe route error:', error);
    return Response.json({ error: error.message || 'Failed to transcribe file.' }, { status: 500 });
  }
}
