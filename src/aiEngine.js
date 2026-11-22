import { getBotSetting, setBotSetting } from './database.js';

// Default AI configurations
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Gets the current AI configuration from DB or environment variables
 */
export function getAIConfig() {
  const baseUrl = (getBotSetting('ai_base_url') || process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = getBotSetting('ai_api_key') || process.env.AI_API_KEY || '';
  const model = getBotSetting('ai_model') || process.env.AI_MODEL || DEFAULT_MODEL;

  return { baseUrl, apiKey, model };
}

/**
 * Sends a chat completion prompt to any OpenAI-compatible API
 * (OpenAI, OpenRouter, Groq, DeepSeek, Together, Ollama, etc.)
 * @param {string} prompt - User message/question
 * @param {string} systemPrompt - Optional system instruction
 * @returns {Promise<string>}
 */
export async function askAI(prompt, systemPrompt = 'You are a smart, helpful, and concise AI assistant in a WhatsApp group. Answer accurately in the same language as the user (Hindi, English, or Hinglish). Keep formatting clean with WhatsApp bold/bullet points.') {
  const { baseUrl, apiKey, model } = getAIConfig();

  if (!apiKey) {
    throw new Error('AI API Key set nahi hai!\nSet karein: */aisettings setkey <your_api_key>*\nYa Render par *AI_API_KEY* environment variable add karein.');
  }

  const endpoint = `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API Error (${response.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error('AI ne koi response nahi diya.');
  }

  return reply;
}

/**
 * Uses AI to generate structured MCQs on any topic on the fly!
 * @param {string} topic - e.g. "Indian History", "Cricket", "Science"
 * @param {number} count - number of questions (1-5)
 * @returns {Promise<Array>} Array of { question, options, answerIndex, correctAnswer, explanation }
 */
export async function generateMCQWithAI(topic = 'General Knowledge', count = 3) {
  const numQuestions = Math.min(Math.max(1, count), 5);
  const prompt = `Generate exactly ${numQuestions} multiple-choice quiz questions on the topic: "${topic}".
Output ONLY a strict JSON array without any markdown fences or conversational text.
Format for each item in the array:
{
  "question": "Question text here?",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "answerIndex": 0, // integer 0 to 3 indicating the correct option
  "correctAnswer": "Option 1",
  "explanation": "Brief 1-sentence explanation"
}`;

  const systemPrompt = 'You are an expert exam paper creator. You only output valid raw JSON array of MCQs without any markdown formatting, backticks, or extra commentary.';

  const raw = await askAI(prompt, systemPrompt);
  
  // Clean raw output in case model returned backticks
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('AI output was not a valid array of questions.');
  }

  return parsed.map((q, idx) => ({
    id: Date.now() + idx,
    category: topic,
    question: q.question,
    options: q.options,
    answerIndex: typeof q.answerIndex === 'number' ? q.answerIndex : q.options.indexOf(q.correctAnswer),
    correctAnswer: q.correctAnswer || q.options[q.answerIndex || 0],
    explanation: q.explanation || ''
  }));
}
