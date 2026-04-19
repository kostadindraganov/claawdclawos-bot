import { QueueError } from "./errors.js";

export type QueueTask = () => Promise<void>;

interface QueueEntry {
  task: QueueTask;
  enqueuedAt: number;
}

export class MessageQueue {
  private readonly queues = new Map<string, QueueEntry[]>();
  private readonly processing = new Set<string>();
  private draining = false;

  enqueue(chatId: string, task: QueueTask): void {
    if (this.draining) throw new QueueError("Queue is draining");
    const q = this.queues.get(chatId) ?? [];
    q.push({ task, enqueuedAt: Date.now() });
    this.queues.set(chatId, q);
    if (!this.processing.has(chatId)) {
      void this.drain(chatId);
    }
  }

  isProcessing(chatId: string): boolean {
    return this.processing.has(chatId);
  }

  depth(chatId: string): number {
    return this.queues.get(chatId)?.length ?? 0;
  }

  private async drain(chatId: string): Promise<void> {
    this.processing.add(chatId);
    try {
      const q = this.queues.get(chatId);
      while (q && q.length > 0) {
        const entry = q.shift();
        if (!entry) break;
        try {
          await entry.task();
        } catch {
          // Individual task errors are the task's responsibility to log/handle.
        }
      }
    } finally {
      this.processing.delete(chatId);
      if ((this.queues.get(chatId)?.length ?? 0) === 0) {
        this.queues.delete(chatId);
      }
    }
  }

  async gracefulDrain(timeoutMs = 10_000): Promise<void> {
    this.draining = true;
    const deadline = Date.now() + timeoutMs;
    while (this.processing.size > 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 100));
    }
  }
}
