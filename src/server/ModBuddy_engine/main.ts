import { GoogleGenAI } from "@google/genai";
import { performFallbackTriage } from './triage'; 

export interface QueueItemData {
    text: string;
    reports: number;
    accountAgeDays: number;
}

export interface ModerationDecision {
    risk: 'urgent' | 'medium' | 'low';
    confidence: number;
    reason: string;
    suggestedAction: 'approve' | 'remove' | 'flag_for_review';
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b'
];

export async function processQueueItem(data: QueueItemData, apiKey: string): Promise<ModerationDecision> {
 
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const schema = {
    type: 'object',
    properties: {
      risk: { type: 'string', enum: ['urgent', 'medium', 'low'] },
      confidence: { type: 'number' },
      reason: { type: 'string' },
      suggestedAction: { type: 'string', enum: ['approve', 'remove', 'flag_for_review'] },
    },
    required: ['risk', 'confidence', 'reason', 'suggestedAction'],
  };

  const prompt = `You are a Reddit Subreddit Auto-Moderator. Analyze this post.
  
  Context:
  - Account Age: ${data.accountAgeDays} days
  - Current User Reports: ${data.reports}
  
  Content: "${data.text}"
  
  Return a JSON object matching the provided schema explaining your decision.`;

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`[AI Engine] Attempting analysis using model: ${model}...`);
      
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.2, 
        },
      });

      const jsonResponse = response.text;
      if (!jsonResponse) throw new Error('Empty response from model.');

      const decision: ModerationDecision = JSON.parse(jsonResponse);
      
      console.log(`[AI Engine] Success! ${model} generated a decision.`);
      return decision;

    } catch (error: any) {
      console.warn(`[AI Engine] ${model} failed or rate-limited. Passing to next model. Error: ${error.message}`);
      lastError = error;
      
    }
  }

  console.error("[AI Engine] CRITICAL: All Gemini models exhausted. Triggering local heuristics.");
  
  try {
      return performFallbackTriage(data);
  } catch (fallbackError) {

      return {
          risk: 'medium',
          confidence: 0,
          reason: "System failure. Flagged for manual safety review.",
          suggestedAction: 'flag_for_review'
      };
  }
} 
