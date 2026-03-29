type ProcessingTask = {
  documentId: string;
  run: () => Promise<void>;
};

type ProcessingState = {
  cancelled: boolean;
};

const queuedTasks: ProcessingTask[] = [];
const processingState = new Map<string, ProcessingState>();
let draining = false;

async function drainQueue() {
  if (draining) return;
  draining = true;

  try {
    while (queuedTasks.length > 0) {
      const next = queuedTasks.shift();
      if (!next) continue;

      const state = processingState.get(next.documentId);
      if (state?.cancelled) {
        processingState.delete(next.documentId);
        continue;
      }

      try {
        await next.run();
      } finally {
        processingState.delete(next.documentId);
      }
    }
  } finally {
    draining = false;
  }
}

export function queueDocumentProcessing(documentId: string, run: () => Promise<void>) {
  if (processingState.has(documentId)) return false;
  processingState.set(documentId, { cancelled: false });
  queuedTasks.push({ documentId, run });
  queueMicrotask(() => {
    void drainQueue();
  });
  return true;
}

export function cancelDocumentProcessing(documentId: string) {
  const state = processingState.get(documentId);
  if (!state) return false;
  state.cancelled = true;
  return true;
}

export function isDocumentProcessingCancelled(documentId: string) {
  return processingState.get(documentId)?.cancelled === true;
}

export function resetDocumentProcessingQueueForTests() {
  queuedTasks.length = 0;
  processingState.clear();
  draining = false;
}
