export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class SessionError extends Error {
  constructor(
    message: string,
    public readonly chatId: string,
    public readonly agentId: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly chatId: string,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

export class ExfiltrationError extends Error {
  constructor(
    message: string,
    public readonly patternsMatched: string[],
  ) {
    super(message);
    this.name = "ExfiltrationError";
  }
}

export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}
