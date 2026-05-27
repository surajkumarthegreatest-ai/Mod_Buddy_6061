import { analyzeContent } from './ai_client';
import { performTriage, TriageInput } from './triage';

export async function processQueueItem(input: TriageInput, apikey: string) {
  const heuristicsResult = performTriage(input);

  // If the heuristic is decisive, return it immediately
  if (heuristicsResult.suggestedAction !== 'flag_for_review') {
    return heuristicsResult;
  }

  // Escalation logic
  try {
    const aiResult = await analyzeContent(input.text, input.reports, input.accountAgeDays, apikey);
    return { ...aiResult, reason: `[AI Decision] ${aiResult.reason}` };
  } catch (error) {
    return { ...heuristicsResult, reason: `[Fallback] ${heuristicsResult.reason}` };
  }
}