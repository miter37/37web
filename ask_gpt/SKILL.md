---
name: ask_gpt
description: Ask any question to ChatGPT, wait for response streaming to finish, and save the resulting answer directly to a .txt file. Single command, fully automated.
version: 1.0.0
metadata:
  hermes:
    tags: [chatgpt, browser, automation, ai, llm]
    category: automation
    requires_toolsets: [terminal]
---

# Ask ChatGPT Skill (`ask_gpt`)

Use this skill whenever you need to **ask ChatGPT (chatgpt.com) a question and get the answer saved to a `.txt` file**.

### ⚠️ IMPORTANT: DO NOT attempt manual browser clicks
ChatGPT renders decoy inputs and streams responses. **Do not use click, fill, or snapshot manually.**
Everything is automated in a single, deterministic command.

---

## How to run (One single command)

### Windows (Command Prompt / PowerShell):
```cmd
<skill>\bin\ask-gpt.cmd --prompt "Your question here" --output "path/to/result.txt"
```

### macOS / Linux:
```bash
<skill>/bin/ask-gpt --prompt "Your question here" --output "path/to/result.txt"
```

### Node.js direct:
```bash
node <skill>/run.mjs --prompt "Your question here" --output "path/to/result.txt"
```

---

## Parameters

| Parameter | Alias | Required | Description |
|---|---|---|---|
| `--prompt` | `-p` | **Yes** | The question or instruction to ask ChatGPT. |
| `--output` | `-o` | No | File path where the answer should be saved. (If omitted, saves to `<skill>/outputs/` automatically). |

---

## Output Example
The command runs silently in the background (headless) and prints JSON on success:
```json
{
  "ok": true,
  "file": "C:\\Users\\doyoon.kim\\Downloads\\awa\\outputs\\dell.txt",
  "text_length": 2115,
  "mode": "headless (default)",
  "preview": "DELL의 최근 주가 상승 요인은..."
}
```

After running, simply read the file or report the saved path to the user.
