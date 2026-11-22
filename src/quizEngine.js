import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { recordAnswer } from './database.js';
import { decryptVoteMessage } from './pollHandler.js';

// Cache for sent poll messages to allow decryption
export const messageStore = new Map();

// Active quiz sessions per group
export const activeQuizzes = new Map();

// Load and normalize questions from either data/questions.json or question.json
export function loadQuestions() {
  const possiblePaths = ['./data/questions.json', './question.json'];
  let list = [];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const items = Array.isArray(raw) ? raw : (raw.questions || []);
        const defaultCategory = raw.chapter || 'History';

        for (const q of items) {
          let ansIdx = q.answerIndex;
          if (typeof ansIdx !== 'number' && q.correctAnswer && Array.isArray(q.options)) {
            ansIdx = q.options.indexOf(q.correctAnswer);
          }
          if (ansIdx >= 0 && q.options && q.options.length >= 2) {
            list.push({
              id: q.id || (list.length + 1),
              category: q.category || defaultCategory,
              question: q.question,
              options: q.options,
              answerIndex: ansIdx,
              correctAnswer: q.correctAnswer || q.options[ansIdx],
              explanation: q.explanation || ''
            });
          }
        }
        if (list.length > 0) {
          console.log(`Loaded ${list.length} questions from ${filePath}`);
          break;
        }
      } catch (err) {
        console.error(`Error loading from ${filePath}:`, err.message);
      }
    }
  }
  return list;
}

let allQuestions = loadQuestions();

// Utility: Shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Format seconds into readable string (e.g. 2.4s)
function formatDuration(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

/**
 * Start a new quiz session in a group
 */
export async function startQuiz(sock, groupJid, questionCount = CONFIG.DEFAULT_QUESTION_COUNT, category = null, tagAll = false) {
  if (activeQuizzes.has(groupJid)) {
    await sock.sendMessage(groupJid, {
      text: `⚠️ *A quiz is already active in this group!*\n\nType *${CONFIG.PREFIX}stopquiz* to cancel the current quiz.`
    });
    return;
  }

  let pool = allQuestions;
  if (category) {
    const filtered = allQuestions.filter(q => q.category.toLowerCase().includes(category.toLowerCase()));
    if (filtered.length > 0) pool = filtered;
  }

  const count = Math.min(Math.max(1, questionCount), CONFIG.MAX_QUESTION_COUNT, pool.length);
  const selectedQuestions = shuffleArray(pool).slice(0, count);

  const session = {
    groupJid,
    questions: selectedQuestions,
    currentIndex: 0,
    totalQuestions: count,
    currentQuestion: null,
    currentPollMsgKey: null,
    pollStartTime: 0,
    votes: new Map(), // voterJid => { optionIndex, optionName, durationMs, isCorrect, userName }
    sessionScores: new Map(), // userJid => { name, points, correctCount }
    timer: null,
    acceptingAnswers: false
  };

  activeQuizzes.set(groupJid, session);

  let mentions = [];
  if (tagAll && groupJid.endsWith('@g.us')) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      mentions = (meta.participants || []).map(p => p.id);
    } catch (e) {
      console.warn('Could not fetch participants for tagall:', e.message);
    }
  }

  // Announce quiz start
  await sock.sendMessage(groupJid, {
    text: `🎯 *Starting Quiz Round!* 🎯\n━━━━━━━━━━━━━━━━━━━━\n` +
          `📊 *Total Questions:* ${count}\n` +
          `⏱️ *Time per Question:* ${CONFIG.QUESTION_TIME_SECONDS} seconds\n` +
          `⚡ *Fastest Correct:* +${CONFIG.POINTS.FASTEST_CORRECT} pts\n` +
          `✅ *Correct Answer:* +${CONFIG.POINTS.CORRECT} pts\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          (tagAll ? `📢 *Notifying all group members!* 📢\n` : '') +
          `🚀 *First question coming in 3 seconds... Get ready!*`,
    mentions
  });

  setTimeout(() => {
    sendNextQuestion(sock, groupJid);
  }, 3000);
}

/**
 * Sends the next question as a single-choice WhatsApp Poll
 */
export async function sendNextQuestion(sock, groupJid) {
  const session = activeQuizzes.get(groupJid);
  if (!session) return;

  if (session.currentIndex >= session.totalQuestions) {
    await finishQuiz(sock, groupJid);
    return;
  }

  const q = session.questions[session.currentIndex];
  session.currentQuestion = q;
  session.votes.clear();
  session.acceptingAnswers = true;
  session.pollStartTime = Date.now();

  const qNumber = session.currentIndex + 1;
  const pollTitle = `❓ [${qNumber}/${session.totalQuestions}] ${q.category}\n${q.question}\n\n⏱️ ${CONFIG.QUESTION_TIME_SECONDS}s remaining`;

  try {
    const sentPoll = await sock.sendMessage(groupJid, {
      poll: {
        name: pollTitle,
        values: q.options,
        selectableCount: 1 // Single choice MCQ!
      }
    });

    session.currentPollMsgKey = sentPoll.key;
    // Store in message store so Baileys can decrypt votes later
    messageStore.set(sentPoll.key.id, sentPoll);

    // Set countdown timer for answering
    session.timer = setTimeout(async () => {
      await evaluateQuestionRound(sock, groupJid);
    }, CONFIG.QUESTION_TIME_SECONDS * 1000);

  } catch (error) {
    console.error('Error sending poll question:', error);
    await sock.sendMessage(groupJid, { text: `❌ Failed to send question. Skipping to next...` });
    session.currentIndex++;
    sendNextQuestion(sock, groupJid);
  }
}

/**
 * Handle incoming poll vote received via messages.upsert
 */
export async function handlePollVoteUpsert(sock, msg) {
  const pollUpdate = msg.message?.pollUpdateMessage;
  if (!pollUpdate) return;

  const creationKey = pollUpdate.pollCreationMessageKey;
  if (!creationKey?.id) return;

  const groupJid = msg.key?.remoteJid;
  const session = activeQuizzes.get(groupJid);
  if (!session || !session.acceptingAnswers) return;

  // Check if vote belongs to current question
  if (session.currentPollMsgKey && session.currentPollMsgKey.id !== creationKey.id) {
    return;
  }

  const originalPoll = messageStore.get(creationKey.id);
  if (!originalPoll) {
    console.warn(`[POLL] Original poll ${creationKey.id} not found in cache`);
    return;
  }

  const voteResult = decryptVoteMessage(sock, msg, originalPoll);
  if (!voteResult) return;

  const { voterJid, selectedOptionIndex, selectedOptionName } = voteResult;
  const cleanVoter = voterJid.replace(/:.*@/, '@');

  // Prevent double voting (only first submission counts)
  if (session.votes.has(cleanVoter)) {
    console.log(`[POLL] User ${cleanVoter} already voted. Ignoring repeat.`);
    return;
  }

  const durationMs = Date.now() - session.pollStartTime;
  const isCorrect = selectedOptionIndex === session.currentQuestion.answerIndex;
  const userName = msg.pushName || cleanVoter.split('@')[0];

  console.log(`🗳️ [VOTE RECORDED] User: ${userName} (@${cleanVoter.split('@')[0]}) -> Option: "${selectedOptionName}" | Correct: ${isCorrect ? '✅' : '❌'} | Time: ${formatDuration(durationMs)}`);

  session.votes.set(cleanVoter, {
    optionIndex: selectedOptionIndex,
    optionName: selectedOptionName,
    durationMs,
    isCorrect,
    userName
  });
}

/**
 * Handle incoming poll vote update (fallback for messages.update)
 */
export async function handlePollUpdate(sock, key, update) {
  const groupJid = key.remoteJid;
  const session = activeQuizzes.get(groupJid);
  if (!session || !session.acceptingAnswers) return;

  if (session.currentPollMsgKey && session.currentPollMsgKey.id !== key.id) {
    return;
  }

  const originalPoll = messageStore.get(key.id);
  if (!originalPoll) return;

  const mockMsg = {
    key: update.pollUpdates?.[0]?.pollUpdateMessageKey || key,
    update
  };

  const voteResult = decryptVoteMessage(sock, mockMsg, originalPoll);
  if (!voteResult) return;

  const { voterJid, selectedOptionIndex, selectedOptionName } = voteResult;
  const cleanVoter = voterJid.replace(/:.*@/, '@');

  if (session.votes.has(cleanVoter)) return;

  const durationMs = Date.now() - session.pollStartTime;
  const isCorrect = selectedOptionIndex === session.currentQuestion.answerIndex;

  session.votes.set(cleanVoter, {
    optionIndex: selectedOptionIndex,
    optionName: selectedOptionName,
    durationMs,
    isCorrect,
    userName: cleanVoter.split('@')[0]
  });
}

/**
 * Handle text-based fallback answer (e.g. user replies with "1", "2", "A", "B")
 */
export async function handleTextAnswer(sock, groupJid, userJid, userName, text) {
  const session = activeQuizzes.get(groupJid);
  if (!session || !session.acceptingAnswers) return;

  const cleanText = text.trim().toUpperCase();
  const q = session.currentQuestion;
  if (!q) return;

  let chosenIndex = -1;

  if (['1', '2', '3', '4'].includes(cleanText)) {
    chosenIndex = parseInt(cleanText) - 1;
  } else if (['A', 'B', 'C', 'D'].includes(cleanText)) {
    chosenIndex = cleanText.charCodeAt(0) - 65;
  } else {
    // Check if user typed full option name
    const matchIndex = q.options.findIndex(opt => opt.toLowerCase() === cleanText.toLowerCase());
    if (matchIndex !== -1) chosenIndex = matchIndex;
  }

  if (chosenIndex < 0 || chosenIndex >= q.options.length) return;

  // Check duplicate vote
  const normalizedUser = userJid.replace(/:.*@/, '@');
  if (session.votes.has(normalizedUser)) return;

  const durationMs = Date.now() - session.pollStartTime;
  const isCorrect = chosenIndex === q.answerIndex;

  session.votes.set(normalizedUser, {
    optionIndex: chosenIndex,
    optionName: q.options[chosenIndex],
    durationMs,
    isCorrect,
    userName
  });
}

/**
 * Evaluate question round results after timer expires
 */
async function evaluateQuestionRound(sock, groupJid) {
  const session = activeQuizzes.get(groupJid);
  if (!session) return;

  session.acceptingAnswers = false;
  if (session.timer) clearTimeout(session.timer);

  const q = session.currentQuestion;
  const correctOptionText = q.options[q.answerIndex];

  // Separate correct and wrong votes
  const correctVotes = [];
  const wrongVotes = [];

  for (const [voterJid, vote] of session.votes.entries()) {
    if (vote.isCorrect) {
      correctVotes.push({ voterJid, ...vote });
    } else {
      wrongVotes.push({ voterJid, ...vote });
    }
  }

  // Sort correct answers by time taken (fastest first)
  correctVotes.sort((a, b) => a.durationMs - b.durationMs);

  const mentions = [];
  let fastestText = 'None';

  // Award points
  correctVotes.forEach((vote, idx) => {
    const isFastest = idx === 0;
    const points = isFastest ? CONFIG.POINTS.FASTEST_CORRECT : CONFIG.POINTS.CORRECT;

    // Record in SQLite DB
    recordAnswer({
      groupJid,
      userJid: vote.voterJid,
      userName: vote.userName,
      questionId: q.id,
      isCorrect: true,
      isFastest,
      points
    });

    // Track session score
    const existing = session.sessionScores.get(vote.voterJid) || {
      name: vote.userName,
      points: 0,
      correctCount: 0
    };
    existing.points += points;
    existing.correctCount += 1;
    existing.name = vote.userName;
    session.sessionScores.set(vote.voterJid, existing);

    mentions.push(vote.voterJid);
  });

  // Record wrong answers in DB
  wrongVotes.forEach((vote) => {
    recordAnswer({
      groupJid,
      userJid: vote.voterJid,
      userName: vote.userName,
      questionId: q.id,
      isCorrect: false,
      isFastest: false,
      points: CONFIG.POINTS.WRONG
    });
  });

  if (correctVotes.length > 0) {
    const fastest = correctVotes[0];
    fastestText = `@${fastest.voterJid.split('@')[0]} in ${formatDuration(fastest.durationMs)} (+${CONFIG.POINTS.FASTEST_CORRECT} pts)`;
  }

  let resultMsg = `⏰ *TIME'S UP!*\n━━━━━━━━━━━━━━━━━━━━\n` +
                  `✅ *Correct Answer:* ${correctOptionText}\n` +
                  (q.explanation ? `💡 *Info:* ${q.explanation}\n` : '') +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚡ *Fastest Correct:* ${fastestText}\n` +
                  `👥 *Total Correct:* ${correctVotes.length} / ${session.votes.size} voters\n`;

  if (correctVotes.length > 1) {
    const others = correctVotes.slice(1).map(v => `@${v.voterJid.split('@')[0]} (+${CONFIG.POINTS.CORRECT} pts)`).join(', ');
    resultMsg += `👏 *Also Correct:* ${others}\n`;
  }

  session.currentIndex++;

  if (session.currentIndex < session.totalQuestions) {
    resultMsg += `━━━━━━━━━━━━━━━━━━━━\n⏭️ *Next question in ${CONFIG.DELAY_BETWEEN_QUESTIONS}s...*`;
  }

  await sock.sendMessage(groupJid, {
    text: resultMsg,
    mentions
  });

  // Schedule next question
  session.nextTimer = setTimeout(() => {
    sendNextQuestion(sock, groupJid);
  }, CONFIG.DELAY_BETWEEN_QUESTIONS * 1000);
}

/**
 * Finish quiz and display final session leaderboard
 */
async function finishQuiz(sock, groupJid) {
  const session = activeQuizzes.get(groupJid);
  if (!session) return;

  const sortedScores = Array.from(session.sessionScores.entries())
    .map(([userJid, data]) => ({ userJid, ...data }))
    .sort((a, b) => b.points - a.points);

  let summary = `🎉 *QUIZ COMPLETED!* 🎉\n━━━━━━━━━━━━━━━━━━━━\n` +
                `📊 *Questions Played:* ${session.totalQuestions}\n\n` +
                `🏆 *ROUND WINNERS:*\n`;

  const mentions = [];
  const medals = ['🥇', '🥈', '🥉'];

  if (sortedScores.length === 0) {
    summary += `_Koi bhi sahi answer nahi de paya is round me!_\n`;
  } else {
    sortedScores.slice(0, 5).forEach((item, i) => {
      const medal = medals[i] || `${i + 1}.`;
      summary += `${medal} @${item.userJid.split('@')[0]} — *${item.points} pts* (${item.correctCount}/${session.totalQuestions} correct)\n`;
      mentions.push(item.userJid);
    });
  }

  summary += `━━━━━━━━━━━━━━━━━━━━\n` +
             `All scores have been saved to the Leaderboard!\n` +
             `Type *${CONFIG.PREFIX}leaderboard* to see the Top Rankings.\n` +
             `Type *${CONFIG.PREFIX}quiz* to play again!`;

  await sock.sendMessage(groupJid, {
    text: summary,
    mentions
  });

  // Clean up
  if (session.timer) clearTimeout(session.timer);
  if (session.nextTimer) clearTimeout(session.nextTimer);
  activeQuizzes.delete(groupJid);
}

/**
 * Stop active quiz manually
 */
export async function stopQuiz(sock, groupJid) {
  const session = activeQuizzes.get(groupJid);
  if (!session) {
    await sock.sendMessage(groupJid, { text: `ℹ️ Koi bhi active quiz nahi chal raha hai.` });
    return;
  }

  if (session.timer) clearTimeout(session.timer);
  if (session.nextTimer) clearTimeout(session.nextTimer);
  activeQuizzes.delete(groupJid);

  await sock.sendMessage(groupJid, {
    text: `🛑 *Quiz has been stopped.* Sabhi scores cancel nahi hue hain, ab tak ke points save ho chuke hain.`
  });
}
