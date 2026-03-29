import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireDocumentManager } from "../auth/middleware.js";
import {
  deleteDocumentForManager,
  DocumentServiceError,
  listAvailableDocuments,
  listDocumentsForInstructor,
  retrieveRelevantChunks,
  uploadDocumentForManager,
} from "../services/documents/documentService.js";
import { parseMultipartForm } from "../services/documents/multipartForm.js";

export const documentsRouter = Router();

const QueryChunksSchema = z.object({
  query: z.string().trim().min(1),
  top_k: z.coerce.number().int().min(1).max(10).optional(),
  document_type: z.union([z.string(), z.array(z.string())]).optional(),
});

function normalizeDocumentTypes(value: string | string[] | undefined) {
  if (typeof value === "undefined") return undefined;
  if (Array.isArray(value)) return value;
  return [value];
}

documentsRouter.get("/", requireAuth, requireDocumentManager, async (req, res) => {
  try {
    const result = await listDocumentsForInstructor({
      actorUserId: req.user!.id,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "document_list_failed" });
  }
});

documentsRouter.get("/library", requireAuth, async (_req, res) => {
  try {
    const result = await listAvailableDocuments();
    return res.json(result);
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "document_library_list_failed" });
  }
});

documentsRouter.post("/upload", requireAuth, requireDocumentManager, async (req, res) => {
  try {
    const form = await parseMultipartForm(req);
    if (!form.file) {
      return res.status(400).json({ error: "file_required" });
    }
    if (!form.fields.document_type || !form.fields.document_type.trim()) {
      return res.status(400).json({ error: "document_type_required" });
    }

    const metadata = form.fields.metadata ? JSON.parse(form.fields.metadata) : null;
    const result = await uploadDocumentForManager({
      actorUserId: req.user!.id,
      filename: form.file.filename,
      mimeType: form.file.contentType,
      buffer: form.file.buffer,
      documentType: form.fields.document_type,
      title: form.fields.title,
      metadata: metadata && typeof metadata === "object" ? metadata : null,
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "metadata_invalid_json" });
    }
    if (error instanceof DocumentServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    const message = error instanceof Error ? error.message : "document_upload_failed";
    if (message === "multipart_form_required" || message === "multipart_boundary_missing") {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: "document_upload_failed" });
  }
});

documentsRouter.delete("/:id", requireAuth, requireDocumentManager, async (req, res) => {
  try {
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) return res.status(400).json({ error: "document_id_required" });

    const result = await deleteDocumentForManager({
      actorUserId: req.user!.id,
      documentId,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "document_delete_failed" });
  }
});

documentsRouter.get("/query", requireAuth, requireDocumentManager, async (req, res) => {
  const parsed = QueryChunksSchema.safeParse(req.query ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await retrieveRelevantChunks({
      actorUserId: req.user!.id,
      query: parsed.data.query,
      topK: parsed.data.top_k,
      documentTypes: normalizeDocumentTypes(parsed.data.document_type),
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "document_query_failed" });
  }
});
