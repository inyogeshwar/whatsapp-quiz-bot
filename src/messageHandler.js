import fs from 'node:fs';
import { CONFIG } from './config.js';
import {
  getGroupLeaderboard,
  getGlobalLeaderboard,
  getUserStats,
  resetGroupLeaderboard,
  getPlayerTier,
  getBotSetting,
  setBotSetting,
  getDb
} from './database.js';
import { startQuiz, stopQuiz, handleTextAnswer, loadQuestions } from './quizEngine.js';
import {
  resolveChannel,
  postQuestionToChannel,
  startChannelAutoPost,
  stopChannelAutoPost
} from './channelEngine.js';
import { askAI, generateMCQWithAI, getAIConfig, generateAIImageUrl } from './aiEngine.js';
import { checkExplicitContent, recordWarning, resetWarning, getWarningCount } from './moderation.js';
import { sendReaction, getRandomCelebrationGif } from './reactionHelper.js';

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

    // Auto-Moderation: Check explicit / abusive content
    if (isGroup && getBotSetting('automod') !== '0') {
      const badWord = checkExplicitContent(text);
      if (badWord) {
        await sendReaction(sock, msg.key, '⚠️');
        const db = getDb();
        const count = recordWarning(db, remoteJid, cleanSender, `Used explicit term`);
        let warnMsg = `⚠️ @${cleanSender.split('@')[0]} *WARNING [${count}/3]*\n` +
                      `Group me gaali ya abusive bhasha use karna mana hai! Please decorum maintain karein.`;
        if (count >= 3) {
          warnMsg += `\n🚨 *Aapne maximum 3 warnings cross kar li hain!* Group Admins take note.`;
        }
        await sock.sendMessage(remoteJid, {
          text: warnMsg,
          mentions: [cleanSender]
        });
        return;
      }
    }

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

      case 'ai':
      case 'gpt':
      case 'ask': {
        const prompt = args.join(' ').trim();
        if (!prompt) {
          await sock.sendMessage(remoteJid, {
            text: `🤖 *AI Chatbot*\n\nPoochhiye koi bhi sawaal:\n👉 *${CONFIG.PREFIX}ai Bharat ka sabse bada rajya kaunsa hai?*\n👉 *${CONFIG.PREFIX}ai Write a python function for fibonacci*`
          });
          return;
        }

        try {
          await sendReaction(sock, msg.key, '⏳');
          const reply = await askAI(prompt);
          await sock.sendMessage(remoteJid, {
            text: `🤖 *AI Assistant:*\n\n${reply}`
          });
          await sendReaction(sock, msg.key, '✅');
        } catch (err) {
          await sendReaction(sock, msg.key, '❌');
          await sock.sendMessage(remoteJid, {
            text: `❌ ${err.message}`
          });
        }
        break;
      }

      case 'aiquiz': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Quiz sirf WhatsApp Groups me kaam karta hai!` });
          return;
        }

        const lastArg = args[args.length - 1];
        const hasCount = args.length > 1 && !isNaN(parseInt(lastArg));
        const count = hasCount ? parseInt(lastArg) : 3;
        const topic = (hasCount ? args.slice(0, -1) : args).join(' ').trim() || 'General Knowledge';

        await sock.sendMessage(remoteJid, {
          text: `🤖 *AI Quiz Generator:* Generating ${count} fresh questions on "*${topic}*"... ⏳`
        });

        try {
          const aiQuestions = await generateMCQWithAI(topic, count);
          await sock.sendMessage(remoteJid, {
            text: `✅ Generated ${aiQuestions.length} MCQs! Starting quiz round now... 🚀`
          });
          await startQuiz(sock, remoteJid, aiQuestions.length, null, false, aiQuestions);
        } catch (err) {
          await sock.sendMessage(remoteJid, {
            text: `❌ AI Question generation failed: ${err.message}`
          });
        }
        break;
      }

      case 'aisettings': {
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'setkey') {
          const key = args[1];
          if (!key) {
            await sock.sendMessage(remoteJid, { text: `⚠️ *Usage:* /aisettings setkey <your_api_key>` });
            return;
          }
          setBotSetting('ai_api_key', key.trim());
          await sock.sendMessage(remoteJid, { text: `✅ *AI API Key Saved Successfully!* 🔐` });
          return;
        }

        if (sub === 'seturl') {
          const url = args[1];
          if (!url) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Usage:* /aisettings seturl <base_url>\n*Examples:*\n• Groq: https://api.groq.com/openai/v1\n• OpenRouter: https://openrouter.ai/api/v1\n• DeepSeek: https://api.deepseek.com/v1\n• OpenAI: https://api.openai.com/v1`
            });
            return;
          }
          setBotSetting('ai_base_url', url.trim());
          await sock.sendMessage(remoteJid, { text: `✅ *AI Base URL Set To:* ${url}` });
          return;
        }

        if (sub === 'setmodel') {
          const model = args[1];
          if (!model) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Usage:* /aisettings setmodel <model_name>\n*Examples:*\n• gpt-4o-mini\n• deepseek-chat\n• llama-3.3-70b-versatile`
            });
            return;
          }
          setBotSetting('ai_model', model.trim());
          await sock.sendMessage(remoteJid, { text: `✅ *AI Model Set To:* ${model}` });
          return;
        }

        if (sub === 'setprompt' || sub === 'systemprompt') {
          const customPrompt = args.slice(1).join(' ').trim();
          if (!customPrompt) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Usage:* /aisettings setprompt <custom_instruction>\n*Example:* /aisettings setprompt You are a knowledgeable Hinglish quiz host with good humor.`
            });
            return;
          }
          setBotSetting('ai_system_prompt', customPrompt);
          await sock.sendMessage(remoteJid, { text: `✅ *AI Custom System Instruction Saved!* 📝` });
          return;
        }

        if (sub === 'resetprompt') {
          setBotSetting('ai_system_prompt', '');
          await sock.sendMessage(remoteJid, { text: `✅ *AI System Instruction reset to default!*` });
          return;
        }

        // Show status
        const { baseUrl, apiKey, model, customPrompt } = getAIConfig();
        const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '❌ Free Engine (Pollinations)';

        await sock.sendMessage(remoteJid, {
          text: `⚙️ *AI CONFIGURATION SETTINGS* ⚙️\n━━━━━━━━━━━━━━━━━━━━\n` +
                `🌐 *Base URL:* ${baseUrl}\n` +
                `🤖 *Model:* ${model}\n` +
                `🔑 *API Key:* ${maskedKey}\n` +
                `📝 *Custom Instruction:* ${customPrompt ? (customPrompt.length > 60 ? customPrompt.slice(0, 60) + '...' : customPrompt) : 'Default'}\n\n` +
                `*Commands:*\n` +
                `🔹 */ai <prompt>* — Ask AI any question\n` +
                `🔹 */aiquiz <topic> [count]* — Auto-generate live quiz\n` +
                `🔹 */aisettings setkey <key>* — Set custom API key\n` +
                `🔹 */aisettings seturl <url>* — Set Base URL (Groq, OpenRouter, etc.)\n` +
                `🔹 */aisettings setmodel <model>* — Set Model name\n` +
                `🔹 */aisettings setprompt <instruction>* — Set custom persona\n` +
                `🔹 */aisettings resetprompt* — Reset system prompt`
        });
        break;
      }

      case 'ping':
      case 'speed': {
        const start = Date.now();
        await sendReaction(sock, msg.key, '🏓');
        const latency = Date.now() - start;
        const uptimeSec = process.uptime();
        const hours = Math.floor(uptimeSec / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        const secs = Math.floor(uptimeSec % 60);
        const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

        await sock.sendMessage(remoteJid, {
          text: `🏓 *PONG!* ⚡\n━━━━━━━━━━━━━━━━━━━━\n` +
                `📶 *Latency:* ${latency}ms\n` +
                `⏱️ *Uptime:* ${hours}h ${mins}m ${secs}s\n` +
                `💾 *RAM Usage:* ${mem} MB\n` +
                `🚀 *Status:* Active & Online`
        });
        break;
      }

      case 'react': {
        const emoji = args[0] || '❤️';
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const targetKey = contextInfo?.stanzaId
          ? {
              remoteJid,
              fromMe: contextInfo.participant === sock.user?.id?.replace(/:.*@/, '@'),
              id: contextInfo.stanzaId,
              participant: contextInfo.participant
            }
          : msg.key;

        await sendReaction(sock, targetKey, emoji);
        break;
      }

      case 'image':
      case 'imagine':
      case 'aiimage': {
        const prompt = args.join(' ').trim();
        if (!prompt) {
          await sock.sendMessage(remoteJid, {
            text: `🎨 *AI Image Generator*\n\nUsage:\n👉 *${CONFIG.PREFIX}image a cute cyberpunk cat in neon tokyo*\n👉 *${CONFIG.PREFIX}imagine futuristic sports car in mountains 4k*`
          });
          return;
        }

        await sendReaction(sock, msg.key, '🎨');
        await sock.sendMessage(remoteJid, {
          text: `🎨 *Generating AI Image for:* "${prompt}"... ⏳`
        });

        try {
          const imageUrl = generateAIImageUrl(prompt);
          await sock.sendMessage(remoteJid, {
            image: { url: imageUrl },
            caption: `✨ *AI Generated Art*\n💭 *Prompt:* ${prompt}\n⚡ *Powered by Pollinations AI*`
          });
          await sendReaction(sock, msg.key, '✅');
        } catch (err) {
          await sendReaction(sock, msg.key, '❌');
          await sock.sendMessage(remoteJid, {
            text: `❌ Image generation failed: ${err.message}`
          });
        }
        break;
      }

      case 'gif': {
        const caption = args.join(' ').trim() || '🎉 Celebration!';
        const gifUrl = getRandomCelebrationGif();
        try {
          await sock.sendMessage(remoteJid, {
            video: { url: gifUrl },
            gifPlayback: true,
            caption: `🎬 ${caption}`
          });
        } catch (err) {
          await sock.sendMessage(remoteJid, { text: `🎬 ${caption}\n${gifUrl}` });
        }
        break;
      }

      case 'warn': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Ye command sirf Groups me kaam karta hai!` });
          return;
        }
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;
        if (!mentioned) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Kisi user ko mention karein ya uske message ka reply karke *${CONFIG.PREFIX}warn* likhein!` });
          return;
        }
        const reason = args.filter(a => !a.startsWith('@')).join(' ').trim() || 'Rule violation';
        const cleanTarget = mentioned.replace(/:.*@/, '@');
        const db = getDb();
        const count = recordWarning(db, remoteJid, cleanTarget, reason);
        let warnText = `⚠️ @${cleanTarget.split('@')[0]} *WARNING [${count}/3]*\n📌 *Reason:* ${reason}`;
        if (count >= 3) {
          warnText += `\n🚨 *User has reached 3 warnings!* Group Admins take note.`;
        }
        await sock.sendMessage(remoteJid, {
          text: warnText,
          mentions: [cleanTarget]
        });
        break;
      }

      case 'resetwarn':
      case 'unwarn': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Ye command sirf Groups me kaam karta hai!` });
          return;
        }
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;
        if (!mentioned) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Kisi user ko mention karein ya reply karein: *${CONFIG.PREFIX}resetwarn @user*` });
          return;
        }
        const cleanTarget = mentioned.replace(/:.*@/, '@');
        const db = getDb();
        resetWarning(db, remoteJid, cleanTarget);
        await sock.sendMessage(remoteJid, {
          text: `✅ Warnings reset to 0 for @${cleanTarget.split('@')[0]}!`,
          mentions: [cleanTarget]
        });
        break;
      }

      case 'warnings':
      case 'warns': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Ye command sirf Groups me kaam karta hai!` });
          return;
        }
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const target = contextInfo?.mentionedJid?.[0] || contextInfo?.participant || cleanSender;
        const cleanTarget = target.replace(/:.*@/, '@');
        const db = getDb();
        const count = getWarningCount(db, remoteJid, cleanTarget);
        await sock.sendMessage(remoteJid, {
          text: `⚠️ *Warning Status for @${cleanTarget.split('@')[0]}:* ${count}/3 warnings`,
          mentions: [cleanTarget]
        });
        break;
      }

      case 'automod': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: `⚠️ Ye command sirf Groups me kaam karta hai!` });
          return;
        }
        const status = (args[0] || '').toLowerCase();
        if (status === 'on' || status === 'enable' || status === '1') {
          setBotSetting('automod', '1');
          await sock.sendMessage(remoteJid, { text: `🛡️ *Auto-Moderation ENABLED!*\nAb abusive words par automatic warning di jayegi.` });
        } else if (status === 'off' || status === 'disable' || status === '0') {
          setBotSetting('automod', '0');
          await sock.sendMessage(remoteJid, { text: `⚠️ *Auto-Moderation DISABLED.*` });
        } else {
          const current = getBotSetting('automod') !== '0' ? 'ON' : 'OFF';
          await sock.sendMessage(remoteJid, {
            text: `🛡️ *Auto-Moderation Status:* ${current}\n\n👉 Type *${CONFIG.PREFIX}automod on* ya *${CONFIG.PREFIX}automod off*`
          });
        }
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
                         `*🎯 Quiz Commands:*\n` +
                         `🔹 */quiz* — 5-question quick quiz\n` +
                         `🔹 */quiz [count]* — Custom length (e.g. */quiz 20*, */quiz all*)\n` +
                         `🔹 */quiz [count] @all* — Start quiz & mention everyone\n` +
                         `🔹 */aiquiz [topic] [count]* — AI generates live fresh MCQs\n` +
                         `🔹 */categories* — View available quiz topics\n` +
                         `🔹 */stop* — End running quiz\n\n` +
                         `*🤖 AI & Creative:*\n` +
                         `🔹 */ai [question]* — Free AI Chatbot (GPT/Claude/Groq)\n` +
                         `🔹 */image [prompt]* — Generate AI art/photos (Free)\n` +
                         `🔹 */aisettings* — Configure API Key, Base URL, Persona\n\n` +
                         `*🛡️ Group Moderation:*\n` +
                         `🔹 */automod on/off* — Auto-warn on slurs & bad words\n` +
                         `🔹 */warn @user [reason]* — Issue warning (3 warnings max)\n` +
                         `🔹 */resetwarn @user* — Clear warnings\n` +
                         `🔹 */warnings* — View warning count\n\n` +
                         `*⚡ Utility & Fun:*\n` +
                         `🔹 */ping* — Check bot response latency & uptime\n` +
                         `🔹 */react [emoji]* — Add emoji reaction to message\n` +
                         `🔹 */gif [caption]* — Send animated celebration GIF\n\n` +
                         `*🏆 Stats & Leaderboard:*\n` +
                         `🔹 */top* ya */leaderboard* — Top 10 champions\n` +
                         `🔹 */rank* — Your score, accuracy & player tier\n` +
                         `🔹 */tagall* — Mention all group members\n\n` +
                         `*📢 Channels:*\n` +
                         `🔹 */channel add [link]* — Connect WhatsApp Channel\n` +
                         `🔹 */channel post* — Post MCQ to channel\n` +
                         `🔹 */channel autopost [mins]* — Schedule auto-posting\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `💡 *Tip:* Question poll me option tap karein ya 1, 2, 3, 4 reply karein!`;

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
