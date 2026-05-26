import { GoogleGenAI } from "@google/genai";

export async function analyzeContent(text: string, reports: number, accountAgeDays: number, apiKey: string) {
  // Initialize the AI client using the key passed from Devvit's settings
  const ai = new GoogleGenAI({
    apiKey: apiKey,
  });

  const schema = {
    type: 'object',
    properties: {
      risk: {
        type: 'string',
        enum: ['urgent', 'medium', 'low'],
      },
      confidence: {
        type: 'number',
      },
      reason: {
        type: 'string',
      },
      suggestedAction: {
        type: 'string',
        enum: ['approve', 'remove', 'flag_for_review'],
      },
    },
    required: ['risk', 'confidence', 'reason', 'suggestedAction'],
  };

  const prompt = `You are a Reddit Subreddit Auto-Moderator. Analyze this post.
  
  Context:
  - Account Age: ${accountAgeDays} days
  - Current User Reports: ${reports}
  
  Content: "${text}"
  
  Return a JSON object matching the provided schema explaining your decision.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const jsonResponse = response.text;
    if (!jsonResponse) throw new Error('Empty response');

    return JSON.parse(jsonResponse);
  } catch (error) {
    console.error('Error analyzing content:', error);
    throw new Error('Failed to analyze content');
  }
}