import { analyzeContent } from './ai_client';
import { performTriage, TriageInput } from './triage';

export async function processQueueItem(input: TriageInput) {
  // STEP 1: The "Zero-Latency Filter" (Your Regex Engine)
  const heuristicsResult = performTriage(input);

  // If the regex engine is confident it's safe or urgent, trust it immediately.
  // This saves you the 3-second wait time and the API cost!
  if (heuristicsResult.suggestedAction === 'approve' || heuristicsResult.suggestedAction === 'remove') {
    console.log("⚡ Handled instantly by Heuristics Engine");
    return heuristicsResult;
  }

  // STEP 2: The "AI Escalation" (Gemini 2.5 Flash)
  // The regex engine flagged this for review. Instead of bothering a human, 
  // we escalate it to our LLM to act as the virtual human moderator.
  console.log("🧠 Grey area detected. Escalating to Gemini AI...");
  
  try {
    const aiResult = await analyzeContent(input.text, input.reports, input.accountAgeDays);
    
    // We add a tag so the frontend knows the AI made this decision
    return {
      ...aiResult,
      reason: `[AI Decision] ${aiResult.reason}`
    };
  } catch (error) {
    console.warn("⚠️ AI Escalation failed. Falling back to heuristic recommendation.");
    // If the API crashes, we just return the original 'flag_for_review' result
    // so the app NEVER crashes during the demo.
    return {
      ...heuristicsResult,
      reason: `[Fallback] ${heuristicsResult.reason}`
    };
  }
}

console.log(await processQueueItem({
  "text": "🚨 SPECIAL DISCOUNT! Buy cheap Viagra now at pharmacy-express.com click link! Free direct shipping guaranteed!! 🚨",
  "reports": 12,
  "accountAgeDays": 0
}));