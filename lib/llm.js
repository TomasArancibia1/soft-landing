// Optional language model for the agent. Any OpenAI-compatible chat-completions
// endpoint works (Gemini, Groq, OpenRouter, ...). Nothing here runs unless
// LLM_API_KEY is set on the server; without it the agent's built-in policy
// decides every step, so the app is fully functional for free.
//
// The key lives only in the server environment. Responses are never logged.

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export const llmEnabled = () => Boolean(process.env.LLM_API_KEY);
export const llmLabel = () => (llmEnabled() ? process.env.LLM_MODEL || DEFAULT_MODEL : null);

export async function chat({ messages, tools, signal, maxTokens = 600, temperature = 0.3, timeoutMs = 25_000 }) {
  const base = (process.env.LLM_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const body = {
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(tools ? { tools, tool_choice: 'auto' } : {})
  };
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  });
  if (!res.ok) throw new Error(`llm_http_${res.status}`);
  const json = await res.json();
  const message = json?.choices?.[0]?.message;
  if (!message) throw new Error('llm_empty');
  return message;
}
