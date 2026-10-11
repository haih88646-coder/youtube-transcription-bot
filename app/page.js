'use client';

import { useMemo, useState } from 'react';

export default function HomePage() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [chatId, setChatId] = useState('');
  const [format, setFormat] = useState('txt');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState('');
  const [downloadName, setDownloadName] = useState('transcript.txt');
  const [message, setMessage] = useState('');

  const isReady = useMemo(() => youtubeUrl.trim() || file, [youtubeUrl, file]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isReady) {
      setMessage('Please enter a YouTube URL or upload an MP3/MP4 file.');
      return;
    }

    setLoading(true);
    setMessage('');
    setResultText('');

    try {
      const formData = new FormData();
      formData.append('format', format);
      formData.append('chatId', chatId);
      if (youtubeUrl.trim()) formData.append('youtubeUrl', youtubeUrl.trim());
      if (file) formData.append('file', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong while transcribing.');
      }

      setDownloadName(data.filename || `transcript.${format}`);
      setResultText(data.text || '');
      setMessage(
        data.sentToTelegram
          ? `Transcript sent to Telegram chat ${data.chatId || 'your configured chat'}.`
          : 'Transcription complete.'
      );
    } catch (error) {
      setMessage(error.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!resultText) return;
    const blob = new Blob([resultText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page-shell">
      <div className="card">
        <h1>YouTube Transcription Bot</h1>
        <p className="subtitle">
          Paste a YouTube URL or upload an MP3/MP4 file, transcribe it with Groq Whisper, and send the result to Telegram.
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span>YouTube URL</span>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>

          <label className="field">
            <span>Upload MP3 / MP4</span>
            <input
              type="file"
              accept=".mp3,.mp4,.m4a,.wav,.aac,.ogg,.webm,.mpeg"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>

          <div className="row">
            <label className="field">
              <span>Output format</span>
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                <option value="txt">TXT</option>
                <option value="srt">SRT</option>
              </select>
            </label>

            <label className="field">
              <span>Telegram chat ID (optional)</span>
              <input
                type="text"
                value={chatId}
                onChange={(event) => setChatId(event.target.value)}
                placeholder="-1001234567890"
              />
            </label>
          </div>

          <button type="submit" className="primary" disabled={loading || !isReady}>
            {loading ? 'Processing...' : 'Transcribe & send'}
          </button>
        </form>

        {message ? <p className="status">{message}</p> : null}

        {resultText ? (
          <section className="result-panel">
            <div className="result-header">
              <h2>Transcript preview</h2>
              <button type="button" className="secondary" onClick={downloadResult}>
                Download {format.toUpperCase()}
              </button>
            </div>
            <textarea readOnly value={resultText} rows={18} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
