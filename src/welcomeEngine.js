import { getBotSetting } from './database.js';

// High quality fallback welcome banner
const FALLBACK_WELCOME_BANNER = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&q=80';

/**
 * Handles group participant updates (welcome new members & farewell left members)
 * @param {object} sock - Baileys socket
 * @param {object} event - { id: groupJid, participants: [string], action: 'add'|'remove'|'promote'|'demote' }
 */
export async function handleParticipantUpdate(sock, event) {
  try {
    const { id, participants, action } = event;
    if (!id || !participants || !participants.length) return;

    // Handle new members joined / added
    if (action === 'add') {
      const isWelcomeEnabled = getBotSetting('welcome_enabled') !== '0';
      if (!isWelcomeEnabled) return;

      const groupMetadata = await sock.groupMetadata(id).catch(() => null);
      const groupName = groupMetadata?.subject || 'the group';

      // Try fetching group profile picture as banner
      let imageBuffer = null;
      try {
        const ppUrl = await sock.profilePictureUrl(id, 'image').catch(() => null);
        const targetUrl = ppUrl || FALLBACK_WELCOME_BANNER;
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (res.ok) {
          imageBuffer = Buffer.from(await res.arrayBuffer());
        }
      } catch (err) {
        // Fallback to text message if image fetch fails
      }

      for (const participant of participants) {
        const cleanJid = participant.replace(/:.*@/, '@');
        const userNumber = cleanJid.split('@')[0];

        const welcomeCaption =
          `👋 *WELCOME TO ${groupName.toUpperCase()}!* 🎉\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Hey @${userNumber}, aapka is group me swagat hai!\n\n` +
          `🧠 *Yahan Daily Live MCQ Quizzes hote hain:*\n` +
          `🔹 Quiz shuru karein: */quiz* ya *.quiz*\n` +
          `🔹 AI se live quiz banwayein: */aiquiz <topic>* ya *.aiquiz <topic>*\n` +
          `🔹 AI chatbot se sawaal poochhein: */ai <prompt>* ya *.ai <prompt>*\n` +
          `🔹 AI photo banwayein: */image <prompt>* ya *.image <prompt>*\n` +
          `🔹 Full Menu & Commands: */help* ya *.help*\n\n` +
          `✨ Rules follow karein, active rahein aur leaderboard par chha jayein! 🚀`;

        if (imageBuffer) {
          await sock.sendMessage(id, {
            image: imageBuffer,
            caption: welcomeCaption,
            mentions: [cleanJid]
          });
        } else {
          await sock.sendMessage(id, {
            text: welcomeCaption,
            mentions: [cleanJid]
          });
        }
      }
    }

    // Handle members left / removed
    if (action === 'remove') {
      const isGoodbyeEnabled = getBotSetting('goodbye_enabled') !== '0';
      if (!isGoodbyeEnabled) return;

      const groupMetadata = await sock.groupMetadata(id).catch(() => null);
      const groupName = groupMetadata?.subject || 'the group';

      for (const participant of participants) {
        const cleanJid = participant.replace(/:.*@/, '@');
        const userNumber = cleanJid.split('@')[0];

        const goodbyeMessage =
          `👋 *ALVIDA @${userNumber}!* ✨\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `@${userNumber} ne *${groupName}* chhod diya ya unhe remove kiya gaya.\n` +
          `Hum aapko miss karenge. Wish you the best! 🌟`;

        await sock.sendMessage(id, {
          text: goodbyeMessage,
          mentions: [cleanJid]
        });
      }
    }
  } catch (error) {
    console.error('Error handling participant update:', error.message);
  }
}
