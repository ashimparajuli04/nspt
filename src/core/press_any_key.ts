import * as p from "@clack/prompts";

export async function pressAnyKey(): Promise<void> {
  if (!process.stdin.isTTY) return;
  p.log.message("Press any key to continue");
  await new Promise<void>((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    };
    process.stdin.once("data", onData);
  });
}
