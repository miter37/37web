#!/usr/bin/env node
/**
 * ask_gpt - Autonomous ChatGPT Question & Text Exporter
 *
 * Runs ChatGPT queries through the underlying adaptive browser engine.
 * Fully automated:
 *  - Headless by default (silent background execution)
 *  - Automatic fallback to headed window if Cloudflare/login/CAPTCHA occurs
 *  - Deterministic completion detection (waits for streaming & thinking to finish)
 *  - Safe extraction bypassing rich charts/interactive widgets
 *  - Saves clean UTF-8 text directly to the requested output path
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// Resolve awa root
let AWA_ROOT = path.resolve(SCRIPT_DIR, "..");
if (!fs.existsSync(path.join(AWA_ROOT, "scripts", "launcher.mjs"))) {
  const sibling = path.resolve(SCRIPT_DIR, "../adaptive-web-agent");
  const downloadsAwa = "C:\\Users\\doyoon.kim\\Downloads\\awa";
  if (fs.existsSync(path.join(sibling, "scripts", "launcher.mjs"))) {
    AWA_ROOT = sibling;
  } else if (fs.existsSync(path.join(downloadsAwa, "scripts", "launcher.mjs"))) {
    AWA_ROOT = downloadsAwa;
  }
}

const OUTPUTS_DIR = path.join(SCRIPT_DIR, "outputs");

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${date}-${time}`;
}

function runWebctl(args) {
  const launcher = path.join(AWA_ROOT, "scripts", "launcher.mjs");
  const raw = execFileSync(process.execPath, [launcher, "webctl", ...args], {
    cwd: AWA_ROOT,
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
    if ((argv[i] === "--prompt" || argv[i] === "-p") && argv[i + 1]) prompt = argv[++i];
    else if ((argv[i] === "--output" || argv[i] === "-o") && argv[i + 1]) outputPath = argv[++i];
    else if (argv[i] === "--session" && argv[i + 1]) session = argv[++i];
  }

  if (!prompt) {
    console.error(JSON.stringify({
      ok: false,
      error: "Missing required --prompt argument. Example: ask-gpt --prompt 'Explain DELL stock rise' --output 'dell.txt'"
    }, null, 2));
    process.exit(1);
  }

  // Ensure default state is headless
  try {
    const status = runWebctl(["browser", "status"]);
    if (!status.chrome?.headless) {
      runWebctl(["browser", "hide"]);
    }
  } catch {}

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
      revealedFallback = true;
      try { runWebctl(["browser", "reveal"]); } catch {}

      // Reconnect/re-open if session was lost
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

    if (!runRes?.ok || !runRes?.returned?.text) {
      throw new Error(`Execution failed after fallback: ${JSON.stringify(runRes)}`);
    }

    const text = runRes.returned.text;

    if (!outputPath) {
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      outputPath = path.join(OUTPUTS_DIR, `chatgpt_${timestamp()}.txt`);
    } else {
      const resolvedDir = path.dirname(path.resolve(outputPath));
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    const targetFile = path.resolve(outputPath);
    fs.writeFileSync(targetFile, text, "utf8");

    console.log(JSON.stringify({
      ok: true,
      file: targetFile,
      text_length: text.length,
      mode: revealedFallback ? "headed (fallback)" : "headless (default)",
      preview: text.slice(0, 100).replace(/\r?\n/g, " ") + "...",
    }, null, 2));

  } finally {
    if (autoSession && session) {
      try { runWebctl(["session", "close", "--session", session]); } catch {}
    }
    if (revealedFallback) {
      try { runWebctl(["browser", "hide"]); } catch {}
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2));
  process.exit(1);
});
