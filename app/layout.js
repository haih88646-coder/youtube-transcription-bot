const { Inter } = require('next/font/google');
const inter = Inter({ subsets: ['latin'] });

module.exports = {
  metadata: {
    title: 'YouTube Transcription Bot',
    description: 'Transcribe YouTube videos or uploaded audio files and send transcription files to Telegram.'
  },
  children: <html lang="en"><body className={inter.className}>{children}</body></html>
};
