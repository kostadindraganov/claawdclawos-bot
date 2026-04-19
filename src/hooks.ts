export interface InboundMessage {
  chatId: string;
  agentId: string;
  text: string;
  hasMedia: boolean;
}

export interface OutboundReply {
  chatId: string;
  agentId: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export type BeforeHook = (msg: InboundMessage) => Promise<InboundMessage | null>;
export type AfterHook = (reply: OutboundReply) => Promise<OutboundReply | null>;

export class HookRegistry {
  private readonly beforeHooks: BeforeHook[] = [];
  private readonly afterHooks: AfterHook[] = [];

  registerBefore(hook: BeforeHook): void {
    this.beforeHooks.push(hook);
  }

  registerAfter(hook: AfterHook): void {
    this.afterHooks.push(hook);
  }

  async runBefore(msg: InboundMessage): Promise<InboundMessage | null> {
    let current: InboundMessage | null = msg;
    for (const hook of this.beforeHooks) {
      if (current === null) return null;
      current = await hook(current);
    }
    return current;
  }

  async runAfter(reply: OutboundReply): Promise<OutboundReply | null> {
    let current: OutboundReply | null = reply;
    for (const hook of this.afterHooks) {
      if (current === null) return null;
      current = await hook(current);
    }
    return current;
  }
}
