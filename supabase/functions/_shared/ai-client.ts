// supabase/functions/_shared/ai-client.ts

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  label?: string;
}

export interface AiClientOptions {
  messages: AiMessage[];
  providers: ProviderConfig[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  seed?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface AiClientResponse {
  ok: boolean;
  text: string;
  usedModel?: string;
  usedLabel?: string;
  error?: string;
  status?: number;
}

export async function fetchWithFallback(options: AiClientOptions): Promise<AiClientResponse> {
  let lastError = '';
  let lastStatus = 500;
  const attempts: string[] = [];

  for (const provider of options.providers) {
    if (!provider.apiKey || !provider.endpoint || !provider.model) {
      console.warn(`[AI Client] Skipping incomplete provider config: ${provider.label || 'Unknown'}`);
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
    const label = provider.label || provider.model;

    try {
      console.log(`[AI Client] Attempting ${label}...`);
      
      const body: any = {
        model: provider.model,
        messages: options.messages,
      };
      
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.topP !== undefined) body.top_p = options.topP;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.seed !== undefined) body.seed = options.seed;
      if (options.jsonMode) body.response_format = { type: 'json_object' };

      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://cuenta-sk.vercel.app',
          'X-Title': 'Cuenta SK',
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        console.log(`[AI Client] Success with ${label} (${text.length} chars)`);
        return { ok: true, text, usedModel: provider.model, usedLabel: label, status: response.status };
      }

      const errText = await response.text();
      lastStatus = response.status;
      lastError = `Status ${response.status}: ${errText.slice(0, 200)}`;
      attempts.push(`${label} (${response.status})`);
      
      console.warn(`[AI Client] Failed with ${label}: ${lastError}`);
      
      // 400 Bad Request means the payload is fundamentally malformed — stop.
      if (response.status === 400) break;

    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError';
      lastStatus = isTimeout ? 408 : 503;
      lastError = isTimeout ? 'Request timed out' : String(err);
      attempts.push(`${label} (${lastStatus})`);
      console.warn(`[AI Client] Error with ${label}: ${lastError}`);
    }
  }

  return { ok: false, text: '', error: `AI attempts failed: ${attempts.join(', ')}`, status: lastStatus };
}
