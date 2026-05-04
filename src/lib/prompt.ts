import { createInterface } from "readline";

/**
 * Ask a yes/no question on stderr (so stdout stays clean for piping).
 * Returns true if the user answers yes.
 * Returns false immediately in non-interactive environments.
 */
export function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "Non-interactive terminal. Use --pay for automated environments.\n"
    );
    return Promise.resolve(false);
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}
