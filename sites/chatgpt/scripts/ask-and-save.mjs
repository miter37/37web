#!/usr/bin/env node
/**
 * Universal ChatGPT Ask & Save Runner
 *
 * Default: Headless mode (no visible browser window).
 * Fallback: If execution fails (e.g. Cloudflare, CAPTCHA, login wall, element timeout),
 *           automatically reveals the browser window (headed mode) so the user/agent can proceed,
 *           and retries once.
 *
 * Usage:
 *   node sites/chatgpt/scripts/ask-and-save.mjs --prompt "Your question..." [--output path/to/file.txt] [--session ID]
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../../..");
const OUTPUTS_DIR = path.resolve(SCRIPT_DIR, "../outputs");

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${date}-${time}`;
}

function runWebctl(args) {
  const launcher = path.join(ROOT_DIR, "scripts", "launcher.mjs");
  const raw = execFileSync(process.execPath, [launcher, "webctl", ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw.trim());
}

async function main() {
  const argv = process.argv.slice(2);
  let prompt = "";
  let outputPath = "";
  let session = "";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt" && argv[i + 1]) prompt = argv[++i];
    else if (argv[i] === "--output" && argv[i + 1]) outputPath = argv[++i];
    else if (argv[i] === "--session" && argv[i + 1]) session = argv[++i];
  }

  if (!prompt) {
    console.error("Error: --prompt is required.");
    console.error('Example: node sites/chatgpt/scripts/ask-and-save.mjs --prompt "DELL 주가 요인"');
    process.exit(1);
  }

  // Ensure default state is headless
  try {
    const status = runWebctl(["browser", "status"]);
    if (!status.chrome?.headless) {
      runWebctl(["browser", "hide"]);
    }
  } catch {
    // Daemon will initialize headless by default if not yet started
  }

  let autoSession = false;
  if (!session) {
    autoSession = true;
    const openRes = runWebctl(["session", "open", "--url", "https://chatgpt.com"]);
    session = openRes.id;
  }

  let revealedFallback = false;

  try {
    let runRes;
    const inputArg = JSON.stringify({ prompt });

    try {
      // 1st Attempt: Run Headless (Default)
      runRes = runWebctl([
        "run",
        "ask_and_extract",
        "--session",
        session,
        "--site",
        "chatgpt",
        "--input",
        inputArg,
      ]);
    } catch (err) {
      runRes = { ok: false, error: err.message || String(err) };
    }

    // Fallback Check: If headless execution failed or timed out, reveal browser and retry
    if (!runRes?.ok || !runRes?.returned?.text) {
      console.warn("\n[Headless Fallback] Headless execution failed or blocked. Revealing visible browser window...");
      revealedFallback = true;
      runWebctl(["browser", "reveal"]);

      // If the session closed during failure, open a fresh session in the visible browser
      try {
        const verifySession = runWebctl(["snapshot", "--session", session]);
        if (!verifySession.ok) {
          const newSession = runWebctl(["session", "open", "--url", "https://chatgpt.com"]);
          session = newSession.id;
        }
      } catch {
        const newSession = runWebctl(["session", "open", "--url", "https://chatgpt.com"]);
        session = newSession.id;
      }

      console.warn("[Headless Fallback] Retrying action in visible browser window...\n");
      runRes = runWebctl([
        "run",
        "ask_and_extract",
        "--session",
        session,
        "--site",
        "chatgpt",
        "--input",
        inputArg,
      ]);
    }

    if (!runRes.ok || !runRes.returned?.text) {
      throw new Error(`Execution failed after fallback: ${JSON.stringify(runRes)}`);
    }

    const text = runRes.returned.text;

    if (!outputPath) {
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      outputPath = path.join(OUTPUTS_DIR, `chatgpt_answer_${timestamp()}.txt`);
    } else {
      const resolvedDir = path.dirname(path.resolve(outputPath));
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    const targetFile = path.resolve(outputPath);
    fs.writeFileSync(targetFile, text, "utf8");

    console.log(JSON.stringify({
      success: true,
      file: targetFile,
      text_length: text.length,
      mode: revealedFallback ? "headed (fallback)" : "headless (default)",
      preview: text.slice(0, 100).replace(/\n/g, " ") + "...",
    }, null, 2));

  } finally {
    if (autoSession && session) {
      runWebctl(["session", "close", "--session", session]);
    }
    // If we revealed the browser during fallback, restore back to headless default
    if (revealedFallback) {
      try {
        runWebctl(["browser", "hide"]);
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error("Run error:", err.message || err);
  process.exit(1);
});
