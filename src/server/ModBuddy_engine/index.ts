import { analyzeContent } from './ai_client';
import { performTriage, TriageInput } from './triage';

export async function processQueueItem(input: TriageInput,apikey: string) {
  // STEP 1: The "Zero-Latency Filter" (Your Regex Engine)
  const heuristicsResult = performTriage(input);

  if (heuristicsResult.suggestedAction === 'approve' || heuristicsResult.suggestedAction === 'remove') {
    console.log("⚡ Handled instantly by Heuristics Engine");
    return heuristicsResult;
  }

  // STEP 2: The "AI Escalation" (Gemini 2.5 Flash)
  console.log("🧠 Grey area detected. Escalating to Gemini AI...");
  
  try {
    const aiResult = await analyzeContent(input.text, input.reports, input.accountAgeDays,apikey);
    
    return {
      ...aiResult,
      reason: `[AI Decision] ${aiResult.reason}`
    };
  } catch (error) {
    console.warn("⚠️ AI Escalation failed. Falling back to heuristic recommendation.");
    return {
      ...heuristicsResult,
      reason: `[Fallback] ${heuristicsResult.reason}`
    };
  }
}
// NO top-level await down here!