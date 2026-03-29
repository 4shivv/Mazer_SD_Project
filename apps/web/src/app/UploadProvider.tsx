import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { listDocuments, uploadDocument, type KnowledgeBaseDocument } from "../lib/api";

export type UploadTaskStatus = "queued" | "uploading" | "processing" | "completed" | "failed";

export type UploadTask = {
  id: string;
  documentId?: string;
  fileName: string;
  documentType: string;
  status: UploadTaskStatus;
  message: string | null;
  createdAt: number;
  completedAt: number | null;
};

type UploadState = {
  uploads: UploadTask[];
  queueUploads: (files: FileList | File[], documentType: string) => string[];
  dismissUpload: (uploadId: string) => void;
  clearFinished: () => void;
};

const UploadContext = createContext<UploadState | null>(null);

function createUploadId(file: File, index: number) {
  return `${file.name}-${file.size}-${Date.now()}-${index}`;
}

function formatServerProcessingMessage() {
  return "Uploaded. Processing on server...";
}

function mergeUploadsWithDocuments(current: UploadTask[], documents: KnowledgeBaseDocument[]) {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const next = current.map((entry) => {
    if (!entry.documentId) return entry;

    const document = documentsById.get(entry.documentId);
    if (!document) {
      if (entry.status === "processing" || entry.status === "uploading" || entry.status === "queued") {
        return {
          ...entry,
          status: "completed" as const,
          message: "Processing is no longer pending on the server.",
          completedAt: entry.completedAt ?? Date.now(),
        };
      }
      return entry;
    }

    if (document.status === "processing") {
      return {
        ...entry,
        fileName: document.original_filename,
        documentType: document.document_type,
        status: "processing" as const,
        message: formatServerProcessingMessage(),
        completedAt: null,
      };
    }

    if (document.status === "failed") {
      return {
        ...entry,
        fileName: document.original_filename,
        documentType: document.document_type,
        status: "failed" as const,
        message: document.processing_error || "Upload failed",
        completedAt: entry.completedAt ?? Date.now(),
      };
    }

    return {
      ...entry,
      fileName: document.original_filename,
      documentType: document.document_type,
      status: "completed" as const,
      message: "Upload complete. Available in the knowledge base.",
      completedAt: entry.completedAt ?? Date.now(),
    };
  });

  for (const document of documents) {
    if (document.status !== "processing") continue;
    if (next.some((entry) => entry.documentId === document.id)) continue;

    next.push({
      id: `server:${document.id}`,
      documentId: document.id,
      fileName: document.original_filename,
      documentType: document.document_type,
      status: "processing",
      message: formatServerProcessingMessage(),
      createdAt: Number.isFinite(Date.parse(document.created_at))
        ? Date.parse(document.created_at)
        : Date.now(),
      completedAt: null,
    });
  }

  return next.sort((a, b) => b.createdAt - a.createdAt);
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const queueRef = useRef(Promise.resolve());

  function queueUploads(files: FileList | File[], documentType: string) {
    const fileBatch = Array.from(files);
    if (fileBatch.length === 0) return [];

    const tasks = fileBatch.map((file, index) => ({
      id: createUploadId(file, index),
      file,
      documentType,
    }));

    const queuedEntries: UploadTask[] = tasks.map((task) => ({
      id: task.id,
      fileName: task.file.name,
      documentType: task.documentType,
      status: "queued",
      message: "Waiting to upload...",
      createdAt: Date.now(),
      completedAt: null,
    }));

    setUploads((current) => [...current, ...queuedEntries]);

    queueRef.current = queueRef.current.then(async () => {
      for (const task of tasks) {
        setUploads((current) =>
          current.map((entry) =>
            entry.id === task.id
              ? {
                  ...entry,
                  status: "uploading",
                  message: "Uploading and processing...",
                }
              : entry
          )
        );

        try {
          const response = await uploadDocument({
            file: task.file,
            documentType: task.documentType,
          });

          setUploads((current) =>
            current.map((entry) =>
              entry.id === task.id
                ? {
                    ...entry,
                    documentId: response.document_id,
                    status: response.status === "ready" ? "completed" : "processing",
                    message:
                      response.status === "ready"
                        ? "Upload complete. Available in the knowledge base."
                        : formatServerProcessingMessage(),
                    completedAt: response.status === "ready" ? Date.now() : null,
                  }
                : entry
            )
          );
        } catch (error: any) {
          setUploads((current) =>
            current.map((entry) =>
              entry.id === task.id
                ? {
                    ...entry,
                    status: "failed",
                    message: error?.message || "Upload failed",
                    completedAt: Date.now(),
                  }
                : entry
            )
          );
        }
      }
    });

    return tasks.map((task) => task.id);
  }

  function dismissUpload(uploadId: string) {
    setUploads((current) => current.filter((entry) => entry.id !== uploadId));
  }

  function clearFinished() {
    setUploads((current) =>
      current.filter(
        (entry) =>
          entry.status === "queued" || entry.status === "uploading" || entry.status === "processing"
      )
    );
  }

  useEffect(() => {
    if (user?.role !== "instructor" && user?.role !== "admin") return;

    let cancelled = false;

    async function syncFromServer() {
      try {
        const response = await listDocuments();
        if (cancelled) return;
        setUploads((current) => mergeUploadsWithDocuments(current, response.documents));
      } catch {
        // Leave local upload state intact if sync fails.
      }
    }

    void syncFromServer();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  const processingCount = useMemo(
    () =>
      uploads.filter(
        (entry) =>
          entry.status === "queued" || entry.status === "uploading" || entry.status === "processing"
      ).length,
    [uploads]
  );

  useEffect(() => {
    if ((user?.role !== "instructor" && user?.role !== "admin") || processingCount === 0) return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await listDocuments();
        if (cancelled) return;
        setUploads((current) => mergeUploadsWithDocuments(current, response.documents));
      } catch {
        // Keep current state and retry on the next interval.
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.role, processingCount]);

  const value = useMemo(
    () => ({
      uploads,
      queueUploads,
      dismissUpload,
      clearFinished,
    }),
    [uploads]
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
  const value = useContext(UploadContext);
  if (!value) throw new Error("useUploads must be used within UploadProvider");
  return value;
}
