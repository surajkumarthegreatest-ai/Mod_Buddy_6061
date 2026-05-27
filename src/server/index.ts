import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { Devvit , SettingScope} from '@devvit/public-api';

import { processQueueItem } from './ModBuddy_engine/main'; 
Devvit.configure({
  redditAPI: true,
  http: true,
});


Devvit.addSettings([
  {
    name: 'gemini_api_key',
    type: 'string',
    label: 'Gemini AI API Key',
    isSecret: true,
    scope: SettingScope.App,
  },
]);

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

Devvit.addTrigger({
  event: 'PostReport',
  onEvent: async (event, context) => {
    console.log(`🚨 POST REPORTED WAKE UP: ${event.post?.id}`);
    try {
      if (!event.post?.id || !event.post?.authorId) return;

      const post = await context.reddit.getPostById(event.post.id);
      const author = await context.reddit.getUserById(event.post.authorId);
      const apiKey = "AIzaSyDLi9_gGI25ZAmfMSm1akOfbJ1oE_ylW44";

      if (!post || !author || !apiKey) return;

      const text = post.body || post.title || "";
      const currentReports = post.numberOfReports ?? 1;
      
      const ageMs = Date.now() - author.createdAt.getTime();
      const accountAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      const decision = await processQueueItem({ text, reports: currentReports, accountAgeDays }, apiKey);

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
          await context.reddit.report( post, decision );
          break;
      }
    } catch (error) {
      console.error("Trigger Error:", error);
    }
  },
});

Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    console.log(`🚨 NEW POST DETECTED WAKE UP: ${event.post?.id}`);
    try {
      if (!event.post?.id || !event.author?.id) return;

      const post = await context.reddit.getPostById(event.post.id);
      const author = await context.reddit.getUserById(event.author.id);
      const apiKey = "AIzaSyDLi9_gGI25ZAmfMSm1akOfbJ1oE_ylW44";

      if (!post || !author || !apiKey) {
          console.warn("Missing post, author, or API key");
          return;
      }

      const text = post.body || post.title || "";
      const ageMs = Date.now() - author.createdAt.getTime();
      const accountAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      const decision = await processQueueItem({ 
        text: text, 
        reports: 0, 
        accountAgeDays: accountAgeDays 
      }, apiKey);

      if (decision.suggestedAction === 'remove') {
        await context.reddit.remove(post.id, false);
        await context.reddit.submitComment({
          id: post.id,
          text: `ModBuddy Auto-Action: Removed. Reason: ${decision.reason}`
        });
        console.log(`Bot successfully removed post: ${post.id}`);
      } else if (decision.suggestedAction === 'flag_for_review') {
        await context.reddit.report( post,decision );
        console.log(`Bot flagged post for human review: ${post.id}`);
      }
    } catch (error) {
      console.error("PostSubmit Trigger Error:", error);
    }
  },
});

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers); 

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});

export default Devvit;
