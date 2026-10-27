import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { shutdownOcrEngine } from './services/tesseract-ocr.js';

try {
  await connectDatabase();
  const server = app.listen(env.PORT, () => {
    console.info(`DepositGuard API listening on port ${env.PORT}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close(() => {
        void shutdownOcrEngine().finally(() => process.exit(0));
      });
    });
  }
} catch {
  // Connection errors may include database hostnames or credentials; keep them out of logs.
  console.error('API startup failed: unable to connect to MongoDB');
  process.exit(1);
}
