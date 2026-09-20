import type { AppConfig } from "../config";
import { readToken } from "./token";

export class BrowserdClient {
  constructor(private config: AppConfig) {}

  async call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const token = await readToken(this.config).catch(() => {
      throw new Error("browserd token not found. Start browserd first.");
    });
    let response: Response;
    try {
      response = await fetch(`http://${this.config.host}:${this.config.port}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ method, params }),
      });
    } catch (error: any) {
      throw new Error(`Cannot reach browserd on ${this.config.host}:${this.config.port}: ${error?.message || error}`);
    }
    const payload = await response.json() as any;
    if (!payload.ok) throw new Error(payload.error || "browserd RPC failed");
    return payload.result as T;
  }
}
