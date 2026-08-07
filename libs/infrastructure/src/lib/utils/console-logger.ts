export class ConsoleLogger {
  constructor(private readonly meta: { source: string }) {}

  info(message: string, extra: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ level: 'INFO', source: this.meta.source, message, ...extra }));
  }

  error(message: string, extra: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ level: 'ERROR', source: this.meta.source, message, ...extra }));
  }

  warn(message: string, extra: Record<string, unknown> = {}): void {
    console.warn(JSON.stringify({ level: 'WARN', source: this.meta.source, message, ...extra }));
  }
}
