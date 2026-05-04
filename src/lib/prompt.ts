import { createInterface } from "readline";

/**
 * Ask a yes/no question on stderr (so stdout stays clean for piping).
 * Returns true if the user answers yes.
 */
export function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}
