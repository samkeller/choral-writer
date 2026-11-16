export function bytesStream(bytes: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const bytesPart of bytes) controller.enqueue(bytesPart);
      controller.close();
    },
  });
}