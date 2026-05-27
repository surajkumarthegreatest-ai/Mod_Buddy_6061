import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import { processQueueItem } from '../ModBuddy_engine/main';
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
const normalizePostId = (id: string): `t3_${string}` => {
  return (id.startsWith('t3_') || id.startsWith('t1_') ? id : `t3_${id}`) as `t3_${string}`;
};
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
  const { postId } = await c.req.json<{ postId: string }>(); 

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const count = await redis.incrBy('count', 1); 

  return c.json<IncrementResponse>({ count, postId, type: 'increment' });
});

api.post('/decrement', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>(); 

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const count = await redis.incrBy('count', -1); 

  return c.json<DecrementResponse>({ count, postId, type: 'decrement' });
});   
api.get('/modqueue', async (c) => {
  const { subredditName } = context;
  if (!subredditName) return c.json({ status: 'error', message: 'Missing name' }, 400);
  const apiKey = "AIzaSyDLi9_gGI25ZAmfMSm1akOfbJ1oE_ylW44";
  if (!apiKey) return c.json({ status: 'error', message: 'API Key missing' }, 500);

  try {
    const subreddit = await reddit.getSubredditByName(subredditName);
    const rawQueue = await subreddit.getModQueue({ limit: 10, type: 'all' }).all();   

    const analyzedPosts = await Promise.all(
      rawQueue.map(async (item) => {
        const authorId = (item as any).authorId;
      
        let accountAgeDays = 30; 
        if (authorId ) {
            const author = await reddit.getUserById(authorId);
            if (author) {
              const ageMs = Date.now() - author.createdAt.getTime();
              accountAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            }
        }

        const devvitItem = item as any;
        const text = devvitItem.body || devvitItem.title || '';
        const reportsCount = (devvitItem.userReports?.length || 0) + (devvitItem.modReports?.length || 0);

        const aiResult = await processQueueItem({
           text: text,
           reports: reportsCount,
           accountAgeDays: accountAgeDays
        }, apiKey);

        return {
           id: item.id,
           content: text,
           category: aiResult.risk === 'urgent' ? 'HATE/SPAM' : 'SAFE',
           recommendation: aiResult.suggestedAction.toUpperCase(),
           engineReason: aiResult.reason
        };
      })
    );

    return c.json({ status: 'success', posts: analyzedPosts });
  } catch (error) {
    return c.json({ status: 'error', message: 'Failed' }, 500);
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



api.post('/remove', async (c) => {
  const { postId } = await c.req.json<{ postId: string }>();

  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    // 1. Get the post object
    const post = await reddit.getPostById(normalizePostId(postId));
   
    await post.remove(); 

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
    await post.remove(true); 

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
    await post.lock(); 

    return c.json({ status: 'success', action: 'locked', postId });
  } catch (error) {
    return c.json<ErrorResponse>({
      status: 'error',
      message: error instanceof Error ? error.message : 'Lock failed',
    }, 500);
  }
});   
