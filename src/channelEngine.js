import { loadQuestions } from './quizEngine.js';
import { getBotSetting, setBotSetting } from './database.js';

let channelTimer = null;

/**
 * Resolves a channel invite link or JID to metadata
 */
export async function resolveChannel(sock, input) {
  const clean = input.trim();
  
  if (clean.includes('whatsapp.com/channel/')) {
    const code = clean.split('whatsapp.com/channel/')[1].split('/')[0].split('?')[0];
    try {
      const meta = await sock.newsletterMetadata('invite', code);
      return {
        jid: meta.id,
        name: meta.name || 'WhatsApp Channel',
        subscribers: meta.subscribers_count || 0
      };
    } catch (err) {
      throw new Error(`Channel link resolve karne me problem aayi: ${err.message}`);
    }
  } else if (clean.endsWith('@newsletter')) {
    try {
      const meta = await sock.newsletterMetadata('jid', clean);
      return {
        jid: meta.id,
        name: meta.name || 'WhatsApp Channel',
        subscribers: meta.subscribers_count || 0
      };
    } catch (err) {
      return { jid: clean, name: 'WhatsApp Channel' };
    }
  }

  throw new Error('Invalid format! Channel link (https://whatsapp.com/channel/...) ya Newsletter JID dein.');
}

/**
 * Posts a single MCQ question to the configured channel
 */
export async function postQuestionToChannel(sock, channelJid) {
  const targetJid = channelJid || getBotSetting('channel_jid');
  if (!targetJid) {
    throw new Error('Pehle channel set karein: */channel set <link>*');
  }

  const questions = loadQuestions();
  if (!questions || questions.length === 0) {
    throw new Error('Database me koi questions nahi mile!');
  }

  // Pick random question
  const q = questions[Math.floor(Math.random() * questions.length)];
  const groupLink = getBotSetting('group_invite_link') || '';

  // 1. Send Single-Choice Poll to Channel
  const pollTitle = `❓ ${q.category ? `[${q.category}] ` : ''}${q.question}`;
  
  await sock.sendMessage(targetJid, {
    poll: {
      name: pollTitle,
      values: q.options,
      selectableCount: 1
    }
  });

  // 2. If group link is configured, send follow-up discussion banner
  if (groupLink) {
    await sock.sendMessage(targetJid, {
      text: `🏆 *Multiplayer Quiz & Leaderboard khelne ke liye Discussion Group join karein:*\n👉 ${groupLink}`
    });
  }

  return q;
}

/**
 * Start recurring auto-posting to channel
 */
export function startChannelAutoPost(sock, intervalMinutes) {
  stopChannelAutoPost();

  const minutes = Math.max(5, parseInt(intervalMinutes) || 60);
  setBotSetting('channel_auto_interval', minutes.toString());
  setBotSetting('channel_auto_active', '1');

  channelTimer = setInterval(async () => {
    try {
      const channelJid = getBotSetting('channel_jid');
      if (channelJid) {
        console.log(`⏰ [AUTO-POST] Posting question to channel: ${channelJid}...`);
        await postQuestionToChannel(sock, channelJid);
      }
    } catch (err) {
      console.error('❌ Auto-post error:', err.message);
    }
  }, minutes * 60 * 1000);

  console.log(`✅ Channel auto-post scheduled every ${minutes} minutes.`);
  return minutes;
}

/**
 * Stop auto-posting
 */
export function stopChannelAutoPost() {
  if (channelTimer) {
    clearInterval(channelTimer);
    channelTimer = null;
  }
  setBotSetting('channel_auto_active', '0');
}

/**
 * Resume auto-post on bot startup if previously active
 */
export function checkResumeChannelAutoPost(sock) {
  const isActive = getBotSetting('channel_auto_active') === '1';
  const interval = parseInt(getBotSetting('channel_auto_interval') || '60');
  const channelJid = getBotSetting('channel_jid');

  if (isActive && channelJid) {
    console.log(`🔄 Resuming channel auto-post every ${interval} minutes to ${channelJid}`);
    startChannelAutoPost(sock, interval);
  }
}
