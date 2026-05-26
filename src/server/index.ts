import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { Devvit } from '@devvit/public-api'; // Import Devvit for menu item
Devvit.addMenuItem({
  label: 'Spawn ModBuddy Dashboard',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const { reddit, ui, subredditName } = context;

    // FIX: Add a safety check. This proves to TypeScript that subredditName is a string.
    if (!subredditName) {
      ui.showToast('Error: Could not determine the subreddit name.');
      return;
    }

    await reddit.submitPost({
      title: 'ModBuddy AI Dashboard',
      subredditName: subredditName, // TypeScript is happy now!
      // The preview HTML shows up for users on older versions of Reddit mobile apps
      preview: (
        '<vstack padding="medium"><text size="large">Loading ModBuddy...</text></vstack>'
      ),
    });
    
    ui.showToast('Dashboard created! Refresh the page to see it.');
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
