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
      // Get the Post and User from Reddit
      if(!event.post) {
        console.error("Invalid event data: missing post");
        return;
      }
      const post = await context.reddit.getPostById(event.post.id);
      if(!post.authorId) {
        console.error("Post is missing authorId");
        return;
      }
      const author = await context.reddit.getUserById(post.authorId);

      // Extract Data
      const text = post.body || post.title || "";
      const currentReports = post.numberOfReports||1;   
      
      if (!author || !author.createdAt) {
        console.warn("Author data not available yet");
        return;
      }   

      const ageMs = Date.now() - author.createdAt.getTime();
      const accountAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      // Fetch your API Key from Devvit Settings (Assuming you configured this in Devvit)
      // If you are hardcoding it for now, just replace this with your string key.
      const apiKey = await context.settings.get('gemini_api_key') as string; 
      
      if (!apiKey) {
        console.error("Missing Gemini API Key");
        return;
      }

      // Feed the real Reddit data into your engine
      const decision = await processQueueItem({
        text: text,
        reports: currentReports,
        accountAgeDays: accountAgeDays
      }, apiKey);

      // Take action based on the engine's decision
      if (decision.suggestedAction === 'remove') {
        await context.reddit.remove(post.id, false);
        console.log(`Removed post: ${post.id}`);
      } else if (decision.suggestedAction === 'approve') {
        await context.reddit.approve(post.id);
        console.log(`Approved post: ${post.id}`);
      }
    } catch (error) {
      console.error("Error in PostReport trigger:", error);
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