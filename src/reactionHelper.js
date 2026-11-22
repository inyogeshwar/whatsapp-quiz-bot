/**
 * React to a WhatsApp message with an emoji
 * @param {object} sock - Baileys socket
 * @param {object} key - Message key
 * @param {string} emoji - Emoji character (e.g. '⚡', '⏳', '✅', '❌')
 */
export async function sendReaction(sock, key, emoji) {
  try {
    if (!key || !emoji) return;
    await sock.sendMessage(key.remoteJid, {
      react: {
        text: emoji,
        key
      }
    });
  } catch (err) {
    // Ignore reaction failures silently
  }
}

// Curated high-energy GIFs for celebration / winners
const CELEBRATION_GIFS = [
  'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.mp4',
  'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.mp4',
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.mp4',
  'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.mp4'
];

export function getRandomCelebrationGif() {
  return CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)];
}
