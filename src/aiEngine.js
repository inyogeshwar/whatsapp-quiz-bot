import { getBotSetting, setBotSetting } from './database.js';

// Default AI configurations
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

// Free zero-key AI endpoint
const FREE_AI_BASE_URL = 'https://text.pollinations.ai/openai';

/**
 * Gets the current AI configuration from DB or environment variables
 */
export function getAIConfig() {
  const baseUrl = (getBotSetting('ai_base_url') || process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = getBotSetting('ai_api_key') || process.env.AI_API_KEY || '';
  const model = getBotSetting('ai_model') || process.env.AI_MODEL || DEFAULT_MODEL;
  const customPrompt = getBotSetting('ai_system_prompt') || 'You are a smart, helpful, and concise AI assistant in a WhatsApp group. Answer accurately in the same language as the user (Hindi, English, or Hinglish). Keep formatting clean with WhatsApp bold/bullet points.';

  return { baseUrl, apiKey, model, customPrompt };
}

/**
 * Sends a chat completion prompt to any OpenAI-compatible API
 * If no API key is provided, falls back to free AI engine automatically!
 * @param {string} prompt - User message/question
 * @param {string} customSystemPrompt - Optional override
 * @returns {Promise<string>}
 */
export async function askAI(prompt, customSystemPrompt = null) {
  const config = getAIConfig();
  const systemPrompt = customSystemPrompt || config.customPrompt;

  // If no API key is configured, use free zero-key AI
  let endpoint = `${config.baseUrl}/chat/completions`;
  let headers = { 'Content-Type': 'application/json' };
  let modelToUse = config.model;

  if (!config.apiKey) {
    endpoint = `${FREE_AI_BASE_URL}/chat/completions`;
    modelToUse = 'openai';
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelToUse,
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
    throw new Error(`AI Provider Error (${response.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error('AI ne koi response nahi diya.');
  }

  return reply;
}

/**
 * Generates high-quality AI images for free using text prompt
 * @param {string} prompt - Image description
 * @returns {string} Image URL
 */
export function generateAIImageUrl(prompt) {
  const cleanPrompt = encodeURIComponent(prompt.trim());
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;
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
  "answerIndex": 0,
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
