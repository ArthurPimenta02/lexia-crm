// Writes the generated OMNI v2 test workflows. Run from the repository root:
//   npx tsx n8n/omnichannel-test/generate.ts
import { writeWorkflows } from "./build";

writeWorkflows().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
