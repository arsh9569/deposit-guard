import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

try {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.info(`DepositGuard API listening on port ${env.PORT}`);
  });
} catch (error) {
  console.error('API startup failed: unable to connect to MongoDB', error);
  process.exit(1);
}
