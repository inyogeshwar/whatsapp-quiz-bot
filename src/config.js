// Configuration file for WhatsApp Quiz Bot

export const CONFIG = {
  // Command prefix (e.g. /quiz, !quiz, .quiz)
  PREFIX: '/',
  SUPPORTED_PREFIXES: ['/', '!', '.'],
  
  // Bot Name
  BOT_NAME: '🧠 WhatsApp Quiz Master',
  
  // Time allotted per question (in seconds)
  QUESTION_TIME_SECONDS: 25,
  
  // Delay between questions (in seconds)
  DELAY_BETWEEN_QUESTIONS: 5,
  
  // Default questions count in a round if not specified
  DEFAULT_QUESTION_COUNT: 5,
  
  // Maximum questions in a single round
  MAX_QUESTION_COUNT: 200,
  
  // Points System
  POINTS: {
    FASTEST_CORRECT: 10,   // First user to answer correctly
    CORRECT: 6,            // Subsequent correct answers
    WRONG: 0               // Wrong answer (can set to negative for penalty)
  },
  
  // Path for session authentication
  AUTH_DIR: './auth_info_baileys',
  
  // Path for SQLite database
  DB_PATH: './data/quiz.db'
};
