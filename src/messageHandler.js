import fs from 'node:fs';
import { CONFIG } from './config.js';
import {
  getGroupLeaderboard,
  getGlobalLeaderboard,
  getUserStats,
  resetGroupLeaderboard,
  getPlayerTier,
  getBotSetting,
  setBotSetting
} from './database.js';
import { startQuiz, stopQuiz, handleTextAnswer, loadQuestions } from './quizEngine.js';
import {
  resolveChannel,
  postQuestionToChannel,
  startChannelAutoPost,
  stopChannelAutoPost
} from './channelEngine.js';

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
          const tier = getPlayerTier(u.score);
          const displayName = u.name ? `${u.name} (@${phone})` : `@${phone}`;
          lbText += `${medal} ${displayName} [${tier.badge} ${tier.title}]\n   ⭐ *${u.score} pts* | ✅ ${u.correct_answers} correct | ⚡ ${u.fastest_count} fastest\n\n`;
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
        const tier = getPlayerTier(u.score);

        const rankText = `👤 *QUIZ PROFILE & STATS*\n━━━━━━━━━━━━━━━━━━━━\n` +
                         `🎖️ *Rank:* #${stats.rank} of ${stats.totalParticipants}\n` +
                         `🔰 *Tier:* ${tier.badge} *${tier.title}*\n` +
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

      case 'channel': {
        const subCmd = (args[0] || '').toLowerCase();

        if (subCmd === 'set') {
          const target = args[1];
          if (!target) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Usage:* /channel set <channel_link_or_jid>\n*Example:*\n/channel set https://whatsapp.com/channel/0029VaXXXXX`
            });
            return;
          }

          try {
            const channel = await resolveChannel(sock, target);
            setBotSetting('channel_jid', channel.jid);
            setBotSetting('channel_name', channel.name);

            await sock.sendMessage(remoteJid, {
              text: `✅ *WhatsApp Channel Linked Successfully!*\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📢 *Name:* ${channel.name}\n` +
                    `🆔 *JID:* ${channel.jid}\n` +
                    `👥 *Subscribers:* ${channel.subscribers}\n\n` +
                    `👉 Ab aap */channel post* karke question bhej sakte hain ya */channel auto 60* se auto-post chalu kar sakte hain!`
            });
          } catch (e) {
            await sock.sendMessage(remoteJid, { text: `❌ ${e.message}` });
          }
          return;
        }

        if (subCmd === 'post') {
          try {
            const channelJid = getBotSetting('channel_jid');
            if (!channelJid) {
              await sock.sendMessage(remoteJid, { text: `⚠️ Pehle channel link karein: */channel set <link>*` });
              return;
            }

            const q = await postQuestionToChannel(sock, channelJid);
            await sock.sendMessage(remoteJid, {
              text: `✅ *Channel me Question Post Kar Diya Gaya!* 🚀\n\n❓ *Question:* ${q.question}\n📢 *Channel:* ${getBotSetting('channel_name') || channelJid}`
            });
          } catch (e) {
            await sock.sendMessage(remoteJid, { text: `❌ Channel me post fail hua: ${e.message}` });
          }
          return;
        }

        if (subCmd === 'auto') {
          const minutes = parseInt(args[1]) || 60;
          const channelJid = getBotSetting('channel_jid');
          if (!channelJid) {
            await sock.sendMessage(remoteJid, { text: `⚠️ Pehle channel link karein: */channel set <link>*` });
            return;
          }

          startChannelAutoPost(sock, minutes);
          await sock.sendMessage(remoteJid, {
            text: `⏰ *Channel Auto-Post Chalu Ho Gaya!* 🚀\n━━━━━━━━━━━━━━━━━━━━\n` +
                  `📢 *Channel:* ${getBotSetting('channel_name') || channelJid}\n` +
                  `⏱️ *Interval:* Har ${minutes} minute me 1 question post hoga.\n` +
                  `🛑 *Band karne ke liye:* */channel stop*`
          });
          return;
        }

        if (subCmd === 'stop') {
          stopChannelAutoPost();
          await sock.sendMessage(remoteJid, { text: `🛑 *Channel auto-posting band kar di gayi hai.*` });
          return;
        }

        if (subCmd === 'grouplink') {
          const link = args[1];
          if (!link) {
            await sock.sendMessage(remoteJid, { text: `⚠️ *Usage:* /channel grouplink <group_invite_link>` });
            return;
          }
          setBotSetting('group_invite_link', link.trim());
          await sock.sendMessage(remoteJid, {
            text: `✅ *Group Discussion Link Set!* Channel me har post ke niche ye link promote hoga.`
          });
          return;
        }

        // Channel Status
        const currentJid = getBotSetting('channel_jid');
        const currentName = getBotSetting('channel_name');
        const autoActive = getBotSetting('channel_auto_active') === '1';
        const interval = getBotSetting('channel_auto_interval') || '60';

        await sock.sendMessage(remoteJid, {
          text: `📢 *WHATSAPP CHANNEL MANAGER* 📢\n━━━━━━━━━━━━━━━━━━━━\n` +
                `🔗 *Linked Channel:* ${currentName ? `${currentName} (${currentJid})` : '_None (Not set)_'}\n` +
                `🔄 *Auto-Posting:* ${autoActive ? `🟢 Active (Every ${interval}m)` : '🔴 Inactive'}\n\n` +
                `*Commands:*\n` +
                `🔹 */channel set <link>* — Channel link karein\n` +
                `🔹 */channel post* — Abhi 1 question post karein\n` +
                `🔹 */channel auto [min]* — Har X minute me auto-post karein\n` +
                `🔹 */channel stop* — Auto-posting rokein\n` +
                `🔹 */channel grouplink <link>* — Channel me group promote karein`
        });
        break;
      }

      case 'addq': {
        const fullText = args.join(' ');
        const parts = fullText.split('|').map(p => p.trim());
        if (parts.length < 3) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *In-Chat Question Creator*\n━━━━━━━━━━━━━━━━━━━━\n` +
                  `👉 *Format:* /addq Question? | Opt1, Opt2, Opt3, Opt4 | CorrectOptionNumber | [Category]\n\n` +
                  `*Example:*\n` +
                  `/addq Bharat ki rajdhani kya hai? | Mumbai, New Delhi, Kolkata, Chennai | 2 | Geography`
          });
          return;
        }

        const qText = parts[0];
        const options = parts[1].split(',').map(o => o.trim());
        const ansNum = parseInt(parts[2]);
        const category = parts[3] || 'General';

        if (options.length < 2) {
          await sock.sendMessage(remoteJid, { text: `❌ Kam se kam 2 options hone chahiye!` });
          return;
        }
        if (isNaN(ansNum) || ansNum < 1 || ansNum > options.length) {
          await sock.sendMessage(remoteJid, { text: `❌ Correct option number 1 se ${options.length} ke beech hona chahiye!` });
          return;
        }

        const newQuestion = {
          id: Date.now(),
          category,
          question: qText,
          options,
          answerIndex: ansNum - 1,
          correctAnswer: options[ansNum - 1],
          explanation: ''
        };

        const currentQuestions = loadQuestions();
        currentQuestions.push(newQuestion);
        fs.writeFileSync('./data/questions.json', JSON.stringify(currentQuestions, null, 2), 'utf8');

        await sock.sendMessage(remoteJid, {
          text: `✅ *New Question Added to Database!* 🎉\n━━━━━━━━━━━━━━━━━━━━\n` +
                `❓ *Question:* ${qText}\n` +
                `📝 *Options:* ${options.join(' • ')}\n` +
                `🎯 *Correct Answer:* Option ${ansNum} (${options[ansNum - 1]})\n` +
                `📚 *Category:* ${category}\n` +
                `📊 *Total Questions in DB:* ${currentQuestions.length}`
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
