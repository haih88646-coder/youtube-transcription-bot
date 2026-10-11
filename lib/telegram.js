export async function sendTelegramDocument({ chatId, filename, content, contentType = 'text/plain', caption = 'Transcript' }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    return { ok: false, skipped: true };
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([content], { type: contentType }), filename);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  return response.json();
}
