import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { Devvit } from '@devvit/public-api'; // Import Devvit for menu item

// 1. IMPORT YOUR ENGINE HERE
import { processQueueItem } from './ModBuddy_engine/main'; 

// Definition

    

Devvit.addMenuItem({
  label: 'Spawn ModBuddy Dashboard',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const { reddit, ui, subredditName } = context;

    if (!subredditName) {
      ui.showToast('Error: Could not determine the subreddit name.');
      return;
    }

    await reddit.submitPost({
      title: 'ModBuddy AI Dashboard',
      subredditName: subredditName, 
      preview: (
        '<vstack padding="medium"><text size="large">Loading ModBuddy...</text></vstack>'
      ),
    });
    
    ui.showToast('Dashboard created! Refresh the page to see it.');
  },
});

// 2. ADD YOUR TRIGGER HERE
Devvit.addTrigger({
  event: 'PostReport',
  onEvent: async (event, context) => {
    try {
      if (!event.post?.id || !event.post?.authorId) return;

      const post = await context.reddit.getPostById(event.post.id);
      const author = await context.reddit.getUserById(event.post.authorId);
      const apiKey = await context.settings.get('gemini_api_key') as string;

      if (!post || !author || !apiKey) return;

      const text = post.body || post.title || "";
      const currentReports = post.numberOfReports ?? 1;
      const ageMs = Date.now() - author.createdAt.getTime();
      const accountAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      const decision = await processQueueItem({ text, reports: currentReports, accountAgeDays }, apiKey);

      // EXECUTE THE HANDS
      switch (decision.suggestedAction) {
        case 'remove':
          await context.reddit.remove(post.id, false);
          await context.reddit.submitComment({
            id: post.id,
            text: `ModBuddy Action: Removed. Reason: ${decision.reason}`
          });
          break;
        case 'approve':
          await context.reddit.approve(post.id);
          break;
        case 'flag_for_review':
          await context.reddit.report( post,decision.reason );
          break;
      }
    } catch (error) {
      console.error("Trigger Error:", error);
    }
  },
});
const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers); // This keeps your /on-app-install HTTP webhook working!

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});