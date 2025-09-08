import { createStorage } from '@jobspy/storage';
import * as texts from '@jobspy/shared-texts';
import * as jobspy from '@jobspy/jobspy-js';
import { createBot } from '@jobspy/bot-logic';

const storage = createStorage();
let botInstance = null;

function getBot() {
  if (!botInstance) {
    botInstance = createBot({ storage, texts, jobspy });
  }
  return botInstance;
}

export async function POST(req) {
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || secretHeader !== expected) {
    return new Response('Forbidden', { status: 403 });
  }
  const update = await req.json();
  const bot = getBot();
  try {
    await bot.handleUpdate(update);
    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response('Error', { status: 200 });
  }
}
