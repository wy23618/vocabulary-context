// Dedicated local test process: never loads the production .env or database.
import { createRuntime } from '../server/index.mjs';

if (!process.env.VOCAB_LOCAL_INSTANCE_ID || !process.env.VOCAB_DATA_DIR?.includes('.runtime')) {
  throw new Error('Start this process with npm run dev:local.');
}
const runtime = createRuntime();
const listener = runtime.app.listen(runtime.config.port, '127.0.0.1', () => {
  console.log(`Local MCP ready: ${runtime.config.publicUrl}/mcp`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => listener.close(async () => {
    await runtime.close();
    process.exit(0);
  }));
}
