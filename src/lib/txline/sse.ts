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

/**
 * Parses a fully-buffered body of newline-joined `data: {...}` lines (the
 * shape TxLINE's historical endpoints return) into their JSON payloads.
 * Unlike `SseStreamDecoder`, this doesn't assume blank-line-separated
 * multi-line blocks — each record is a single `data:` line.
 */
export function parseSseDataLines(text: string): unknown[] {
  const records: unknown[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      records.push(JSON.parse(payload));
    } catch {
      // Skip malformed lines rather than failing the whole response.
    }
  }
  return records;
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
