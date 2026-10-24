import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

try {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.info(`DepositGuard API listening on port ${env.PORT}`);
  });
} catch {
  // Connection errors may include database hostnames or credentials; keep them out of logs.
  console.error('API startup failed: unable to connect to MongoDB');
  process.exit(1);
}
