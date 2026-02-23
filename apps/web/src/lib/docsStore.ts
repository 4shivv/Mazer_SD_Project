export type DocStatus = "Queued" | "Processing" | "Ready";

export type Doc = {
  id: string;
  name: string;
  size: number;
  status: DocStatus;
  createdAt: number;
};

const KEY = "mazer.kb.docs";

function read(): Doc[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(docs: Doc[]) {
  localStorage.setItem(KEY, JSON.stringify(docs));
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listDocs(): Doc[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function addDocs(files: FileList | File[]): Doc[] {
  const arr = Array.isArray(files) ? files : Array.from(files);
  const newDocs: Doc[] = arr.map((f) => ({
    id: uid(),
    name: f.name,
    size: f.size,
    status: "Queued",
    createdAt: Date.now(),
  }));

  const next = [...newDocs, ...read()];
  write(next);
  return newDocs;
}

export function updateDocStatus(ids: string[], status: DocStatus) {
  const set = new Set(ids);
  const next = read().map((d) => (set.has(d.id) ? { ...d, status } : d));
  write(next);
}

export function deleteDoc(id: string) {
  const next = read().filter((d) => d.id !== id);
  write(next);
}

export function clearDocs() {
  write([]);
}