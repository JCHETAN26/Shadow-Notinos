import { createAgentWorker } from "./agent.worker.js";

// Standalone worker process: `pnpm --filter @shadow/api worker`.
const worker = createAgentWorker();

process.on("SIGTERM", () => worker.close().then(() => process.exit(0)));
process.on("SIGINT", () => worker.close().then(() => process.exit(0)));
