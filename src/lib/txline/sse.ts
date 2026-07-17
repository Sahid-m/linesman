export type SseMessage = {
  id?: string;
  event?: string;
  retry?: number;
  data: string;
};

export function parseSseBlock(block: string): SseMessage | null {
  const data: string[] = [];
  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;
  let hasField = false;

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separator = rawLine.indexOf(":");
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator);
    let value = separator < 0 ? "" : rawLine.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      data.push(value);
      hasField = true;
    } else if (field === "id" && !value.includes("\0")) {
      id = value;
      hasField = true;
    } else if (field === "event") {
      event = value;
      hasField = true;
    } else if (field === "retry" && /^\d+$/.test(value)) {
      retry = Number(value);
      hasField = true;
    }
  }
  return hasField ? { id, event, retry, data: data.join("\n") } : null;
}

export class SseStreamDecoder {
  private readonly decoder = new TextDecoder();
  private buffer = "";

  push(chunk: Uint8Array): SseMessage[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const blocks = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = blocks.pop() ?? "";
    return blocks
      .map((block) => parseSseBlock(block))
      .filter((message): message is SseMessage => message !== null);
  }

  finish(): SseMessage[] {
    this.buffer += this.decoder.decode();
    const message = parseSseBlock(this.buffer);
    this.buffer = "";
    return message ? [message] : [];
  }
}
