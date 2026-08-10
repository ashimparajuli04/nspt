import * as p from "@clack/prompts";

export async function runCliAction(action: () => Promise<string | void>): Promise<void> {
  try {
    const result = await action();
    if (result === "error") process.exit(1);
  } catch (err) {
    p.log.error(`Unexpected error: ${(err as Error).message}`);
    process.exit(1);
  }
}
