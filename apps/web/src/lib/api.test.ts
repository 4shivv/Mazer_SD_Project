import { afterEach, describe, expect, it, vi } from "vitest";
import { sendChatStream } from "./api";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("sendChatStream", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses token events and returns the completion payload", async () => {
    const onStart = vi.fn();
    const onToken = vi.fn();
    const onComplete = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          streamFromChunks([
            'event: start\ndata: {"conversation_id":"conv-1"}\n\n',
            'event: token\ndata: {"text":"Hello"}\n\n',
            'event: token\ndata: {"text":" world"}\n\n',
            'event: complete\ndata: {"reply":"Hello world","conversation_id":"conv-1"}\n\n',
          ]),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }
        )
      )
    );

    const result = await sendChatStream("test prompt", "conv-1", {
      onStart,
      onToken,
      onComplete,
    });

    expect(onStart).toHaveBeenCalledWith({ conversation_id: "conv-1" });
    expect(onToken).toHaveBeenNthCalledWith(1, "Hello");
    expect(onToken).toHaveBeenNthCalledWith(2, " world");
    expect(onComplete).toHaveBeenCalledWith({
      reply: "Hello world",
      conversation_id: "conv-1",
    });
    expect(result).toEqual({
      reply: "Hello world",
      conversation_id: "conv-1",
    });
  });
});
