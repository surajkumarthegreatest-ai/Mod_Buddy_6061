import { Hono } from 'hono';
import { context, redis, reddit ,settings } from '@devvit/web/server';
import { processQueueItem } from '../ModBuddy_engine/index';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
} from '../../shared/api';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

/* -------------------------
   HELPERS (FIX FOR t3_/t1_ ERROR)
--------------------------*/
const normalizePostId = (id: string): `t3_${string}` => {
  return (id.startsWith('t3_') || id.startsWith('t1_') ? id : `t3_${id}`) as `t3_${string}`;
};

/* -------------------------
   INIT ENDPOINT
--------------------------*/
api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message:
          error instanceof Error
            ? `Initialization failed: ${error.message}`
            : 'Unknown error during initialization',
      },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>(); // Get from body

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const count = await redis.incrBy('count', 1); // Key is 'count'

  return c.json<IncrementResponse>({ count, postId, type: 'increment' });
});

api.post('/decrement', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>(); // Get from body

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const count = await redis.incrBy('count', -1); // Decrement by 1

  return c.json<DecrementResponse>({ count, postId, type: 'decrement' });
});   
api.get('/modqueue', async (c) => {
  const { subredditName } = context;

  if (!subredditName) {
    return c.json<ErrorResponse>({ status: 'error', message: 'subredditName is required' }, 400);
  }

  try {
    const subreddit = await reddit.getSubredditByName(subredditName);
    
    // FIX 1: Devvit requires the 'type' parameter when passing options
    const rawQueue = await subreddit.getModQueue({ limit: 10, type: 'all' }).all();   

    const analyzedPosts = await Promise.all(
      rawQueue.map(async (item) => {
        
        // 1. Cast to 'any' to bypass the strict Post | Comment union conflicts
        const devvitItem = item as any;

        // 2. Extract text safely (Posts have titles, Comments just have bodies)
        const title = devvitItem.title || 'Comment';
        const text = devvitItem.body || devvitItem.text || '';
        const combinedText = `${title} - ${text}`;
        
        // 3. Extract reports safely
        // If it has numReports (Comment), use it. Otherwise, count the arrays (Post).
        const reportsCount = devvitItem.numReports !== undefined 
          ? devvitItem.numReports 
          : (devvitItem.userReports?.length || 0) + (devvitItem.modReports?.length || 0);

        const apiKey = await settings.get('ai_secret_key');

        if (!apiKey) {
          // Return a clean JSON error so the frontend doesn't crash
            return c.json({ status: 'error', message: 'API Key not found in App Settings!' }, 500);
        }
        // 🧠 RUN THE ENGINE
        const aiResult = await processQueueItem({
           text: combinedText,
           reports: reportsCount,
           accountAgeDays: 30 // Hardcoded for now
        }, apiKey as string);

        return {
           id: item.id,
           title: title,
           content: text,
           category: aiResult.risk === 'urgent' ? 'HATE/SPAM' : aiResult.risk === 'medium' ? 'REVIEW' : 'SAFE',
           priority: aiResult.risk === 'urgent' ? 5 : aiResult.risk === 'medium' ? 3 : 1,
           confidence: Math.round(aiResult.confidence * 100),
           riskScore: aiResult.risk === 'urgent' ? 95 : aiResult.risk === 'medium' ? 60 : 15,
           recommendation: aiResult.suggestedAction.toUpperCase(),
           engineReason: aiResult.reason
        };
      })
    );

    return c.json({ status: 'success', subreddit: subredditName, posts: analyzedPosts });

  } catch (error) {
    return c.json<ErrorResponse>({ status: 'error', message: error instanceof Error ? error.message : 'Failed' }, 500);
  }
});

api.post('/approve', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>();

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const post = await reddit.getPostById(normalizePostId(postId));
    await post.approve();   
    return c.json({ status: 'success', action: 'approved', postId });
  } catch (error) {
    return c.json<ErrorResponse>({ status: 'error', message: error instanceof Error ? error.message : 'Approve failed' }, 500);
  }
});   

/* -------------------------
   REMOVE
--------------------------*/

api.post('/remove', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>();

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    // 1. Get the post object
    const post = await reddit.getPostById(normalizePostId(postId));
    // 2. Call remove() on the post object
    await post.remove(); // Use post.remove() instead of reddit.mod.remove()

    return c.json({ status: 'success', action: 'removed', postId });
  } catch (error) {
    return c.json<ErrorResponse>({
      status: 'error',
      message: error instanceof Error ? error.message : 'Remove failed',
    }, 500);
  }
});   


api.post('/spam', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>();

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const post = await reddit.getPostById(normalizePostId(postId));
    await post.remove(true); // Remove and mark as spam

    return c.json({ status: 'success', action: 'marked_spam', postId });
  } catch (error) {
    return c.json<ErrorResponse>({
      status: 'error',
      message: error instanceof Error ? error.message : 'Spam failed',
    }, 500);
  }
});


api.post('/lock', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>();

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const post = await reddit.getPostById(normalizePostId(postId));
    await post.lock(); // Lock the post

    return c.json({ status: 'success', action: 'locked', postId });
  } catch (error) {
    return c.json<ErrorResponse>({
      status: 'error',
      message: error instanceof Error ? error.message : 'Lock failed',
    }, 500);
  }
});   
