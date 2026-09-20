#!/usr/bin/env node
/**
 * Save the OS clipboard to sites/chatgpt/outputs/chatgpt_response_<YYYYMMDD-HHMMSS>.txt.
 *
 * Run this right after clicking ChatGPT's own "copy response" button (by hand, or via the
 * ask_and_copy site action) - it never asks an LLM to read or retype the answer, so a long
 * response costs no extra tokens and takes no extra time to save.
 *
 * Usage:
 *   node sites/chatgpt/scripts/save-clipboard.mjs
 *   node sites/chatgpt/scripts/save-clipboard.mjs --name my-note   (custom prefix, still timestamped)
 *
 * Prints the saved file's path (not its contents) to stdout.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUTS_DIR = path.join(SITE_DIR, "outputs");

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${date}-${time}`;
}

/** Reads the OS clipboard as text. Throws a clear error if the platform tool is missing. */
function readClipboard() {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      // Piping Get-Clipboard through stdout and decoding as utf8 corrupts non-ASCII text
      // (Korean, etc.): PowerShell writes console output in the system's legacy codepage,
      // not UTF-8, regardless of the encoding Node requests when reading the pipe. Writing
      // the clipboard straight to a UTF-8 file from inside PowerShell sidesteps that
      // mismatch entirely - -Raw preserves newlines exactly as copied.
      const tmp = path.join(os.tmpdir(), `awa-clipboard-${process.pid}-${Date.now()}.txt`);
      const psCommand = `Get-Clipboard -Raw | Set-Content -LiteralPath ${JSON.stringify(tmp)} -Encoding UTF8 -NoNewline`;
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand]);
      try {
        // Strip a leading BOM: Windows PowerShell's -Encoding UTF8 writes one; PowerShell 7
        // does not. Stripping unconditionally is correct either way.
        return fs.readFileSync(tmp, "utf8").replace(/^﻿/, "");
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
    if (platform === "darwin") {
      return execFileSync("pbpaste", [], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    }
    // Linux: try xclip, then xsel, then wl-paste (Wayland).
    for (const [cmd, args] of [
      ["xclip", ["-selection", "clipboard", "-o"]],
      ["xsel", ["--clipboard", "--output"]],
      ["wl-paste", []],
    ]) {
      try {
        return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      } catch {
        // try the next tool
      }
    }
    throw new Error("No clipboard tool found. Install one of: xclip, xsel, wl-clipboard.");
  } catch (error) {
    throw new Error(`Could not read the OS clipboard: ${error.message || error}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const nameIdx = args.indexOf("--name");
  const prefix = nameIdx >= 0 && args[nameIdx + 1] ? args[nameIdx + 1] : "chatgpt_response";

  const text = readClipboard();
  if (!text || !text.trim()) {
    console.error("Clipboard is empty - nothing to save. Copy a response first.");
    process.exit(1);
  }

  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const file = path.join(OUTPUTS_DIR, `${prefix}_${timestamp()}.txt`);
  fs.writeFileSync(file, text, "utf8");
  console.log(file);
}

main();
