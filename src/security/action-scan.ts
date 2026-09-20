import fs from "node:fs/promises";

const forbidden = [
  { re: /(?:from\s+|require\s*\()?["'](?:node:)?child_process["']/, reason: "process execution is forbidden in site actions" },
  { re: /(?:from\s+|require\s*\()?["'](?:node:)?fs(?:\/promises)?["']/, reason: "filesystem access is forbidden in site actions" },
  { re: /(?:from\s+|require\s*\()?["'](?:node:)?(?:net|tls|dgram|http|https)["']/, reason: "raw external networking is forbidden in site actions" },
  { re: /\bfetch\s*\(/, reason: "external fetch is forbidden in site actions; use the page/browser context" },
  { re: /\bprocess\.env\b/, reason: "environment secrets are forbidden in site actions" },
  { re: /\b(?:exec|execFile|spawn|fork)\s*\(/, reason: "process execution is forbidden in site actions" },
];

export async function scanActionFile(file: string): Promise<void> {
  const source = await fs.readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.re.test(source)) throw new Error(`Security scan rejected ${file}: ${rule.reason}`);
  }
}
