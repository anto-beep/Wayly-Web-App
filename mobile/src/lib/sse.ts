// Server-Sent-Events streaming over POST for React Native + web.
// RN's fetch does not expose a readable stream, so we use XMLHttpRequest and
// parse the incrementally-growing responseText for `data: {...}` frames.
import { API, getActiveParticipantId, getToken } from "@/src/lib/api";

export type SSEHandle = { abort: () => void };

export async function streamSSE(
  path: string,
  body: any,
  handlers: {
    onEvent: (evt: any) => void;
    onError?: (message: string) => void;
    onDone?: () => void;
  }
): Promise<SSEHandle> {
  const token = await getToken();
  const pid = await getActiveParticipantId();

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${API}${path}`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "text/event-stream");
  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  if (pid) xhr.setRequestHeader("X-Participant-Id", pid);

  let processed = 0;

  const flush = () => {
    const text = xhr.responseText;
    // Only parse up to the last complete frame boundary (blank line).
    const boundary = text.lastIndexOf("\n\n");
    if (boundary < 0 || boundary + 2 <= processed) return;
    const ready = text.slice(processed, boundary);
    processed = boundary + 2;
    for (const part of ready.split("\n\n")) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        handlers.onEvent(JSON.parse(json));
      } catch {
        /* skip malformed frame */
      }
    }
  };

  xhr.onprogress = () => flush();
  xhr.onload = () => {
    flush();
    // Parse any trailing frame not ending in a blank line.
    const tail = xhr.responseText.slice(processed).trim();
    if (tail.startsWith("data:")) {
      try {
        handlers.onEvent(JSON.parse(tail.slice(5).trim()));
      } catch {
        /* ignore */
      }
    }
    handlers.onDone?.();
  };
  xhr.onerror = () => handlers.onError?.("Connection lost while decoding.");
  xhr.ontimeout = () => handlers.onError?.("The decode timed out. Please try again.");
  xhr.timeout = 120000;

  xhr.send(JSON.stringify(body ?? {}));

  return { abort: () => xhr.abort() };
}
