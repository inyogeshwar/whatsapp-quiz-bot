import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import readline from 'node:readline';

import { CONFIG } from './src/config.js';
import { initDatabase } from './src/database.js';
import { handleIncomingMessage } from './src/messageHandler.js';
import { handlePollUpdate, handlePollVoteUpsert, messageStore } from './src/quizEngine.js';

// Initialize SQLite Database
initDatabase();

// Pairing code argument check (e.g. node index.js --pairing=919876543210)
const pairingArg = process.argv.find(arg => arg.startsWith('--pairing'));
let pairingNumber = pairingArg ? pairingArg.split('=')[1] : null;

async function startBot() {
  console.log(`\n===========================================`);
  console.log(`🤖 Starting ${CONFIG.BOT_NAME}...`);
  console.log(`===========================================\n`);

  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WhatsApp Web v${version.join('.')} (Latest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }), // Suppress internal debug logs for clean terminal
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    getMessage: async (key) => {
      // Provide message from in-memory cache to decrypt poll votes
      return messageStore.get(key.id)?.message;
    }
  });

  // Handle pairing code if requested and not yet registered
  if (pairingNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const cleanNumber = pairingNumber.replace(/[^0-9]/g, '');
        console.log(`📱 Requesting Pairing Code for: +${cleanNumber}...`);
        const code = await sock.requestPairingCode(cleanNumber);
        console.log(`\n🔑 ==========================================`);
        console.log(`👉 YOUR WHATSAPP PAIRING CODE:  ${code}`);
        console.log(`==========================================\n`);
        console.log(`Instructions: WhatsApp > Linked Devices > Link with phone number instead`);
      } catch (err) {
        console.error('Failed to request pairing code:', err.message);
      }
    }, 3000);
  }

  // Connection Updates (QR code, Connected, Disconnected)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pairingNumber) {
      console.log('\n📲 Scan this QR Code with your WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log(`Alternatively, you can run: node index.js --pairing=<YOUR_PHONE_NUMBER> to link with code.\n`);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Connection closed. Status code: ${statusCode}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        console.log('❌ Logged out. Delete auth_info_baileys folder to scan new QR code.');
      }
    } else if (connection === 'open') {
      console.log(`\n🎉 ==========================================`);
      console.log(`✅ WhatsApp Bot Successfully Connected!`);
      console.log(`📱 Connected as: ${sock.user?.id || 'Bot'}`);
      console.log(`🎯 Prefix: ${CONFIG.PREFIX}`);
      console.log(`💬 Commands: ${CONFIG.PREFIX}quiz, ${CONFIG.PREFIX}top, ${CONFIG.PREFIX}rank, ${CONFIG.PREFIX}help`);
      console.log(`==========================================\n`);
    }
  });

  // Save auth credentials
  sock.ev.on('creds.update', saveCreds);

  // Incoming Messages (Commands, Text Answers, Poll Votes)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      // Check if this message is a poll vote
      if (msg.message?.pollUpdateMessage) {
        await handlePollVoteUpsert(sock, msg);
        continue;
      }
      await handleIncomingMessage(sock, msg);
    }
  });

  // Poll Vote Updates
  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
      if (update?.pollUpdates) {
        await handlePollUpdate(sock, key, update);
      }
    }
  });
}

startBot().catch(err => {
  console.error('Fatal Bot Error:', err);
});
