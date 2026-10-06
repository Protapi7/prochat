// ProChat Gemini Free API Service

const DEFAULT_MODEL = 'gemini-2.5-flash';

export function getGeminiApiKey() {
  try {
    return localStorage.getItem('gemini_api_key') || '';
  } catch (e) {
    return '';
  }
}

export function setGeminiApiKey(key) {
  try {
    if (key) {
      localStorage.setItem('gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  } catch (e) {}
}

export function getGeminiModel() {
  try {
    return localStorage.getItem('gemini_model') || DEFAULT_MODEL;
  } catch (e) {
    return DEFAULT_MODEL;
  }
}

export function setGeminiModel(model) {
  try {
    localStorage.setItem('gemini_model', model);
  } catch (e) {}
}

/**
 * Core call to Google Gemini REST API
 */
export async function callGeminiApi({ prompt, contents, apiKey, model }) {
  const key = apiKey || getGeminiApiKey();
  const selectedModel = model || getGeminiModel();

  if (!key) {
    // Fallback to backend proxy if client has no API key stored
    try {
      const token = localStorage.getItem('token');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const res = await fetch(`${backendUrl}/api/gemini/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt, contents, model: selectedModel })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text;
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Gemini Proxy request failed');
      }
    } catch (err) {
      throw new Error(
        'Gemini API Key is missing. Please add your free API key from Google AI Studio in ProChat Settings (⚙️).'
      );
    }
  }

  // Direct client call to Gemini Free API endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`;

  let payloadContents = [];
  if (contents && contents.length > 0) {
    payloadContents = contents;
  } else {
    payloadContents = [
      {
        parts: [{ text: prompt }]
      }
    ];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: payloadContents })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Gemini API Error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error && parsed.error.message) {
        errorMsg = parsed.error.message;
      }
    } catch (e) {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text).join('') || '';
  return text;
}

/**
 * 1-on-1 AI Assistant Conversation
 */
export async function askGemini(userPrompt, chatHistory = [], systemInstruction = '') {
  const contents = [];

  const sysPrefix = systemInstruction || 
    "You are Gemini AI, a helpful, intelligent, and friendly assistant integrated into ProChat, a secure private messaging web app. Keep responses clear, concise, well-formatted, and helpful. Use markdown when useful.";

  // Format previous messages for Gemini API
  const formattedHistory = chatHistory.slice(-10).map(msg => ({
    role: msg.sender === 'Gemini AI' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  if (formattedHistory.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: `${sysPrefix}\n\nUser Message: ${userPrompt}` }]
    });
  } else {
    // Insert system prompt into first user message
    formattedHistory[0].parts[0].text = `${sysPrefix}\n\n${formattedHistory[0].parts[0].text}`;
    formattedHistory.push({
      role: 'user',
      parts: [{ text: userPrompt }]
    });
    contents.push(...formattedHistory);
  }

  return await callGeminiApi({ contents });
}

/**
 * Generate 3 Quick Smart Reply Chips
 */
export async function getSmartReplies(recentMessages = []) {
  if (!recentMessages || recentMessages.length === 0) return [];
  
  const conversationSnippet = recentMessages.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n');
  const prompt = `Based on this 1-on-1 chat conversation context, generate exactly 3 short, natural, friendly suggested quick reply options for the current user. 
Return ONLY a valid JSON array of 3 strings, e.g. ["Sounds good!", "Can you clarify?", "Let's do it!"]. Do not add markdown backticks or extra text.

Conversation Context:
${conversationSnippet}`;

  try {
    const rawText = await callGeminiApi({ prompt });
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 3);
    }
  } catch (e) {
    console.warn("Smart replies generation error:", e);
  }
  return ["Sounds good!", "Thanks for letting me know!", "Let's talk soon."];
}

/**
 * Summarize 1-on-1 Chat Conversation
 */
export async function summarizeChat(recentMessages = []) {
  if (!recentMessages || recentMessages.length === 0) return "No messages to summarize.";
  
  const conversationSnippet = recentMessages.map(m => `${m.sender}: ${m.text}`).join('\n');
  const prompt = `Summarize the following 1-on-1 chat history into 3-4 concise bullet points highlighting key decisions or updates:\n\n${conversationSnippet}`;
  
  return await callGeminiApi({ prompt });
}

/**
 * Translate Text
 */
export async function translateText(text, targetLang = 'English') {
  if (!text) return text;
  const prompt = `Translate the following text into ${targetLang}. Return ONLY the translated text without extra explanation:\n\n"${text}"`;
  return await callGeminiApi({ prompt });
}

/**
 * Polish / Enhance Tone of Text
 */
export async function polishText(text, tone = 'professional') {
  if (!text) return text;
  const prompt = `Rewrite and polish the following message to be ${tone}, clear, and grammatically perfect. Return ONLY the revised message text:\n\n"${text}"`;
  return await callGeminiApi({ prompt });
}
