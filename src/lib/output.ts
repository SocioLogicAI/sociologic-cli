const isColorEnabled = process.env.NO_COLOR === undefined;

function ansi(code: string, text: string): string {
  if (!isColorEnabled) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export function success(msg: string): string {
  return `${ansi("32", "✓")} ${msg}`;
}

export function error(msg: string): string {
  return `${ansi("31", "✗")} ${msg}`;
}

export function warn(msg: string): string {
  return `${ansi("33", "!")} ${msg}`;
}

export function dim(msg: string): string {
  return ansi("2", msg);
}

export function bold(msg: string): string {
  return ansi("1", msg);
}

export function tierBadge(tier: string): string {
  switch (tier.toLowerCase()) {
    case "verified":
      return ansi("32", "verified");
    case "unverified":
      return ansi("33", "unverified");
    case "community":
      return dim("community");
    default:
      return tier;
  }
}

export function table(rows: string[][]): string {
  if (rows.length === 0) return "";

  // Determine the maximum number of columns
  const colCount = Math.max(...rows.map((r) => r.length));

  // Calculate max width for each column
  const colWidths: number[] = Array.from({ length: colCount }, () => 0);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      // Strip ANSI codes when measuring width
      const stripped = row[i].replace(/\x1b\[[0-9;]*m/g, "");
      if (stripped.length > colWidths[i]) {
        colWidths[i] = stripped.length;
      }
    }
  }

  // Render rows with padding
  const lines = rows.map((row) => {
    return row
      .map((cell, i) => {
        if (i === row.length - 1) return cell; // Don't pad last column
        const stripped = cell.replace(/\x1b\[[0-9;]*m/g, "");
        const padding = colWidths[i] - stripped.length;
        return cell + " ".repeat(padding);
      })
      .join("  ");
  });

  return lines.join("\n");
}
