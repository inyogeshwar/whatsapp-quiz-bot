import { CONFIG } from './config.js';
import { getGroupLeaderboard, getGlobalLeaderboard, getUserStats, resetGroupLeaderboard } from './database.js';
import { startQuiz, stopQuiz, handleTextAnswer, loadQuestions } from './quizEngine.js';

export async function handleIncomingMessage(sock, msg) {
  try {
    const isFromMe = msg.key.fromMe;
    if (isFromMe) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = (isGroup ? msg.key.participant : remoteJid) || remoteJid;
    const cleanSender = senderJid.replace(/:.*@/, '@');
    const senderName = msg.pushName || cleanSender.split('@')[0];

    // Extract message body text
    const messageContent = msg.message?.conversation ||
                           msg.message?.extendedTextMessage?.text ||
                           msg.message?.pollCreationMessage?.name ||
                           '';

    const text = messageContent.trim();
    if (!text) return;

    const prefixes = CONFIG.SUPPORTED_PREFIXES || [CONFIG.PREFIX, '!'];
    const usedPrefix = prefixes.find(p => text.startsWith(p));

    // Check if this is an answer to an active quiz (text answer fallback)
    if (isGroup && !usedPrefix) {
      handleTextAnswer(sock, remoteJid, cleanSender, senderName, text);
      return;
    }

    if (!usedPrefix) return;

    const args = text.slice(usedPrefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    switch (command) {
      case 'quiz':
      case 'startquiz': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Quiz feature sirf WhatsApp Groups me kaam karta hai!` });
          return;
        }

        let count = CONFIG.DEFAULT_QUESTION_COUNT;
        let category = null;
        const tagAll = args.some(a => a.toLowerCase() === '@all' || a.toLowerCase() === 'tagall' || a.toLowerCase() === 'everyone');

        // Filter out tagall flags from args
        const cleanArgs = args.filter(a => !['@all', 'tagall', 'everyone'].includes(a.toLowerCase()));

        if (cleanArgs[0] && cleanArgs[0].toLowerCase() === 'all') {
          count = 200; // All questions
        } else if (cleanArgs[0] && !isNaN(parseInt(cleanArgs[0]))) {
          count = parseInt(cleanArgs[0]);
          if (cleanArgs[1]) category = cleanArgs[1];
        } else if (cleanArgs[0]) {
          category = cleanArgs[0];
        }

        await startQuiz(sock, remoteJid, count, category, tagAll);
        break;
      }

      case 'tagall':
      case 'everyone':
      case 'all': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Ye command sirf WhatsApp Group me kaam karta hai!` });
          return;
        }

        try {
          const groupMeta = await sock.groupMetadata(remoteJid);
          const participants = (groupMeta.participants || []).map(p => p.id);
          const customMsg = args.join(' ') || 'Sabhi log active ho jayein! Quiz shuru ho raha hai.';

          let text = `📢 *ATTENTION EVERYONE* 📢\n` +
                     `👥 *Group:* ${groupMeta.subject}\n` +
                     `💬 *Message:* ${customMsg}\n\n` +
                     `━━━━━━━━━━━━━━━━━━━━\n`;

          participants.forEach((p, idx) => {
            text += `${idx + 1}. @${p.split('@')[0]}\n`;
          });

          text += `━━━━━━━━━━━━━━━━━━━━\n⚡ Type */quiz* to start playing!`;

          await sock.sendMessage(remoteJid, {
            text,
            mentions: participants
          });
        } catch (err) {
          console.error('Error in tagall:', err);
          await sock.sendMessage(remoteJid, { text: `❌ Failed to mention members: ${err.message}` });
        }
        break;
      }

      case 'stop':
      case 'stopquiz':
      case 'endquiz': {
        if (!isGroup) return;
        await stopQuiz(sock, remoteJid);
        break;
      }

      case 'top':
      case 'leaderboard':
      case 'lb': {
        const topUsers = isGroup ? getGroupLeaderboard(remoteJid, 10) : getGlobalLeaderboard(10);

        if (!topUsers || topUsers.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `📊 *Leaderboard is Empty!*\n\nAbhi tak kisi ne quiz nahi khela. Type *${CONFIG.PREFIX}quiz* to start!`
          });
          return;
        }

        let lbText = `🏆 *${isGroup ? 'GROUP' : 'GLOBAL'} QUIZ LEADERBOARD* 🏆\n━━━━━━━━━━━━━━━━━━━━\n`;
        const mentions = [];
        const medals = ['🥇', '🥈', '🥉'];

        topUsers.forEach((u, i) => {
          const medal = medals[i] || `${i + 1}.`;
          const phone = u.user_jid.split('@')[0];
          const displayName = u.name ? `${u.name} (@${phone})` : `@${phone}`;
          lbText += `${medal} ${displayName}\n   ⭐ *${u.score} pts* | ✅ ${u.correct_answers} correct | ⚡ ${u.fastest_count} fastest\n\n`;
          mentions.push(u.user_jid);
        });

        lbText += `━━━━━━━━━━━━━━━━━━━━\nType *${CONFIG.PREFIX}rank* to see your rank.`;

        await sock.sendMessage(remoteJid, {
          text: lbText,
          mentions
        });
        break;
      }

      case 'rank':
      case 'myrank':
      case 'score': {
        const stats = getUserStats(remoteJid, cleanSender);

        if (!stats.found || stats.stats.total_answered === 0) {
          await sock.sendMessage(remoteJid, {
            text: `ℹ️ @${cleanSender.split('@')[0]}, aapne abhi tak koi question answer nahi kiya hai!\nType *${CONFIG.PREFIX}quiz* karke khelna shuru karein.`,
            mentions: [cleanSender]
          });
          return;
        }

        const u = stats.stats;
        const accuracy = u.total_answered > 0 ? ((u.correct_answers / u.total_answered) * 100).toFixed(1) : 0;

        const rankText = `👤 *QUIZ PROFILE & STATS*\n━━━━━━━━━━━━━━━━━━━━\n` +
                         `🎖️ *Rank:* #${stats.rank} of ${stats.totalParticipants}\n` +
                         `⭐ *Total Points:* ${u.score} pts\n` +
                         `✅ *Correct Answers:* ${u.correct_answers} / ${u.total_answered}\n` +
                         `🎯 *Accuracy:* ${accuracy}%\n` +
                         `⚡ *Fastest Responder:* ${u.fastest_count} times\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `Keep playing to climb up the leaderboard!`;

        await sock.sendMessage(remoteJid, {
          text: rankText,
          mentions: [cleanSender]
        });
        break;
      }

      case 'categories':
      case 'category': {
        const questions = loadQuestions();
        const cats = [...new Set(questions.map(q => q.category).filter(Boolean))];
        const catList = cats.map((c, i) => `${i + 1}. ${c}`).join('\n');

        await sock.sendMessage(remoteJid, {
          text: `📚 *Available Quiz Categories (${cats.length}):*\n━━━━━━━━━━━━━━━━━━━━\n` +
                `${catList}\n\n` +
                `📊 *Total Questions in DB:* ${questions.length}\n` +
                `👉 *Usage:* Type *${CONFIG.PREFIX}quiz 5 <category>*`
        });
        break;
      }

      case 'help':
      case 'menu': {
        const helpText = `🧠 *${CONFIG.BOT_NAME}* 🧠\n━━━━━━━━━━━━━━━━━━━━\n` +
                         `*Quiz Commands:*\n` +
                         `🔹 */quiz* — Start a 5-question quiz\n` +
                         `🔹 */quiz [count]* — Start quiz with specific count (e.g. */quiz 50*, */quiz all*)\n` +
                         `🔹 */quiz [count] @all* — Start quiz & notify all members\n` +
                         `🔹 */stop* ya */stopquiz* — Stop the active quiz anytime\n\n` +
                         `*Group & Mentions:*\n` +
                         `🔹 */tagall [msg]* ya */everyone* — Mention all group members\n\n` +
                         `*Stats & Leaderboard:*\n` +
                         `🔹 */top* ya */leaderboard* — Top 10 players\n` +
                         `🔹 */rank* — Your score & accuracy\n` +
                         `🔹 */categories* — List question topics\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `💡 *Tip:* Question Poll me option tap karein, ya text reply (1, 2, 3, 4) bhejein!`;

        await sock.sendMessage(remoteJid, { text: helpText });
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}
