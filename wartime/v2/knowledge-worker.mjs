import { openKnowledge } from "../knowledge.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  const req = JSON.parse(input),
    kb = await openKnowledge();
  try {
    process.stdout.write(
      JSON.stringify(
        req.operation === "record"
          ? kb.get(req.id)
          : kb.search(req.query, {
              limit: req.limit ?? 6,
              category: req.category,
            }),
      ),
    );
  } finally {
    kb.close();
  }
} catch {
  process.stdout.write(JSON.stringify({ error: "KNOWLEDGE_REQUEST_FAILED" }));
  process.exitCode = 1;
}
