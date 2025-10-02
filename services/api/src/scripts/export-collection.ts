import { createApp } from '../app.js';
import { generatePostmanCollection } from '../utils/postman.js';

const run = async () => {
  const app = createApp();
  generatePostmanCollection(app);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to export collection', error);
  process.exit(1);
});
