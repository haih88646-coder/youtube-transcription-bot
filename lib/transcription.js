import { downloadYouTubeAudio, transcribeAudioFile, generateTranscriptFile } from '@/lib/transcription';
import { sendTelegramDocument } from '@/lib/telegram';

function isYouTubeUrl(value) {
  return /(?:youtu\.be|youtube\.com)/i.test(value || '');
}

export async function POST(request) {
  try {
    const update = await request.json();
    const message = update?.message;
    const text = message?.text || '';
    const chatId = message?.chat?.id;

    if (!message || !chatId) {
      return Response.json({ ok: true });
    }

    if (text.startsWith('/start')) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Send me a YouTube URL or upload an MP3/MP4 file, and I will transcribe it to TXT or SRT and send the file back.'
        })
      });
      return Response.json({ ok: true });
    }

    if (isYouTubeUrl(text)) {
      const filePath = await downloadYouTubeAudio(text);
      const { text: transcriptText, segments } = await transcribeAudioFile(filePath);
      const srt = generateTranscriptFile({ text: transcriptText, segments, format: 'srt' });

      await sendTelegramDocument({
        chatId,
        filename: 'transcript.srt',
        content: srt,
        contentType: 'text/plain',
        caption: 'Your transcript in SRT format.'
      });

      return Response.json({ ok: true });
    }

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Please send a valid YouTube URL or upload an audio/video file.'
      })
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegram webhook error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
