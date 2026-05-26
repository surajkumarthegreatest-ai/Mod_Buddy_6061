export interface TriageInput {
  text: string;
  reports: number;
  accountAgeDays: number;
}

export interface TriageOutput {
  risk: 'low' | 'medium' | 'urgent';
  confidence: number; // minimum=0, maximum=1
  reason: string;
  suggestedAction: 'approve' | 'flag_for_review' | 'remove';
}

export const performTriage = (input: TriageInput): TriageOutput => {
  const trimmedText = (input.text || '').trim();
  const repCount = Math.max(0, Number(input.reports || 0));
  const age = Math.max(0, Number(input.accountAgeDays || 0));
  const normalizedText = trimmedText.toLowerCase();

  // Word categories rulesets
  const spamKeywords = [
    'viagra', 'cash', 'click link', 'crypto', 'free money', 'earn cash', 
    'buy followers', 'register here', 'dm me', 'discord link', 'telegram link', 
    'cheap drugs', 'pills', 'pharmacy'
  ];
  const toxicKeywords = [
    'retard', 'idiot', 'trash', 'scumbag', 'fuck', 'shit', 'kill yourself', 
    'kys', 'cheat', 'scammer', 'fraud', 'scam'
  ];
  const neutralKeywords = [
    'question', 'how to', 'help', 'guide', 'tutorial', 'documentation', 
    'install', 'setup', 'thanks', 'appreciate', 'works'
  ];

  let spamCount = 0;
  let toxicCount = 0;
  let neutralCount = 0;

  // \b ensures we only match whole words. 'i' makes it case-insensitive.
  spamKeywords.forEach(kw => {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) spamCount++;
  });
  toxicKeywords.forEach(kw => {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) toxicCount++;
  });
  neutralKeywords.forEach(kw => {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) neutralCount++;
  });
  
  const hasSevereSlurOrSelfHarm = 
    new RegExp(`\\b(kill yourself|kys|retard)\\b`, 'i').test(normalizedText);

  // Content Weight Calculation
  let contentScore = 0;
  if (spamCount > 0) contentScore -= (spamCount * 2.5);
  if (toxicCount > 0) contentScore -= (toxicCount * 3.0);
  if (neutralCount > 0) contentScore += (neutralCount * 1.5);

  let risk: 'low' | 'medium' | 'urgent' = 'low';
  let suggestedAction: 'approve' | 'flag_for_review' | 'remove' = 'approve';
  const reasons: string[] = [];

  // Matrix evaluation
  if (repCount >= 8) {
    if (age <= 5 || contentScore < -2 || hasSevereSlurOrSelfHarm) {
      risk = 'urgent';
      suggestedAction = 'remove';
      reasons.push(`Target has reached severe alert threshold (${repCount} reports) with unverified profile indicators. Critical violation detected.`);
    } else {
      risk = 'urgent';
      suggestedAction = 'flag_for_review';
      reasons.push(`Account registered significant community pushback (${repCount} reports). Content requires immediate human moderator intervention.`);
    }
  } else if (repCount >= 3) {
    if (age <= 2) {
      risk = 'urgent';
      suggestedAction = 'remove';
      reasons.push(`Premature flags (${repCount} reports) originating on a fresh sleeper profile created under 48 hours ago.`);
    } else if (contentScore <= -3) {
      risk = 'urgent';
      suggestedAction = 'remove';
      reasons.push(`Explicit threat matches: bad content signals (${contentScore.toFixed(1)}) accompanied by community alerts (${repCount} flags).`);
    } else {
      risk = 'medium';
      suggestedAction = 'flag_for_review';
      reasons.push(`Accumulated ${repCount} feedback flags in a short period window. Queued for standard moderation audit.`);
    }
  } else {
    // Low reports (0, 1, or 2)
    if (hasSevereSlurOrSelfHarm) {
      risk = 'urgent';
      suggestedAction = 'remove';
      reasons.push("Severe toxicity or self-harm keywords triggered. Instant rule automated ban enforced.");
    } else if (contentScore <= -5) {
      risk = 'urgent';
      suggestedAction = 'remove';
      reasons.push(`Gross content guidelines violation: content rating is strictly toxic (${contentScore.toFixed(1)} score rating).`);
    } else if (contentScore <= -2) {
      if (age < 7) {
        risk = 'urgent';
        suggestedAction = 'remove';
        reasons.push(`Suspicious promotion or toxicity (${contentScore.toFixed(1)}) posted by unverified member (age: ${age}d).`);
      } else {
        risk = 'medium';
        suggestedAction = 'flag_for_review';
        reasons.push(`Questionable content score (${contentScore.toFixed(1)}) on standard profile. Flagged for review.`);
      }
    } else {
      // Safe evaluation (INCLUDES DAY-ZERO LOOPHOLE FIX)
      if (age <= 2 && contentScore < 0) {
        risk = 'medium';
        suggestedAction = 'flag_for_review';
        reasons.push(`New account (age: ${age}d) with mildly negative score. Held for review.`);
      } else if (age <= 1 && repCount > 0) {
        risk = 'medium';
        suggestedAction = 'flag_for_review';
        reasons.push(`Day zero account (age: ${age}d) generating initial report alerts. Temporary queue containment recommended.`);
      } else {
        risk = 'low';
        suggestedAction = 'approve';
        reasons.push("Complies cleanly with automated guidelines. Positive/neutral language, mature history, healthy indicators.");
      }
    }
  }

  // Confidence mapping
  let baseConfidence = 1.0;
  if (suggestedAction === 'flag_for_review') {
    baseConfidence -= 0.15; // Reviews have intrinsic uncertainty
  }
  if (age > 100 && contentScore < -1 && repCount > 0) {
    baseConfidence -= 0.12; // Contradictory old profile with bad text
  }
  if (age < 3 && contentScore > 1 && repCount > 1) {
    baseConfidence -= 0.18; // Contradictory fresh profile, clean text, but flagged
  }

  // Adjust by reports slightly to introduce variation
  const confidence = Math.min(0.99, Math.max(0.48, baseConfidence - (repCount * 0.008)));

  return {
    risk,
    confidence: Math.round(confidence * 100) / 100,
    reason: reasons[0] || "Fully evaluated with nominal structural heuristic weights.",
    suggestedAction
  };
};