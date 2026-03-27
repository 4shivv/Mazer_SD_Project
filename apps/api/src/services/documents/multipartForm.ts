import type { Request } from "express";

export type ParsedMultipartFile = {
  fieldName: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
};

export type ParsedMultipartForm = {
  fields: Record<string, string>;
  file: ParsedMultipartFile | null;
};

function readRequestBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function extractBoundary(contentType: string) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2] ?? null;
}

function findBufferIndex(haystack: Buffer, needle: Buffer, startAt = 0) {
  return haystack.indexOf(needle, startAt);
}

function parseContentDisposition(value: string) {
  const nameMatch = value.match(/name="([^"]+)"/i);
  const filenameMatch = value.match(/filename="([^"]*)"/i);
  return {
    name: nameMatch?.[1] ?? null,
    filename: filenameMatch?.[1] ?? null,
  };
}

export async function parseMultipartForm(req: Request): Promise<ParsedMultipartForm> {
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("multipart_form_required");
  }

  const boundary = extractBoundary(contentType);
  if (!boundary) {
    throw new Error("multipart_boundary_missing");
  }

  const body = await readRequestBody(req);
  const boundaryMarker = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  let file: ParsedMultipartFile | null = null;
  let offset = 0;

  while (offset < body.length) {
    const partStart = findBufferIndex(body, boundaryMarker, offset);
    if (partStart === -1) break;

    const nextMarkerStart = findBufferIndex(body, boundaryMarker, partStart + boundaryMarker.length);
    if (nextMarkerStart === -1) break;

    let part = body.subarray(partStart + boundaryMarker.length, nextMarkerStart);
    offset = nextMarkerStart;

    if (part.length === 0) continue;
    if (part.equals(Buffer.from("--"))) break;

    if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.subarray(0, part.length - 2);
    }
    if (part.length === 2 && part[0] === 45 && part[1] === 45) break;
    if (part.length >= 2 && part[part.length - 2] === 45 && part[part.length - 1] === 45) {
      part = part.subarray(0, part.length - 2);
    }

    const separator = findBufferIndex(part, Buffer.from("\r\n\r\n"));
    if (separator === -1) continue;

    const headerText = part.subarray(0, separator).toString("utf8");
    const content = part.subarray(separator + 4);
    const headers = headerText.split("\r\n");

    const dispositionLine = headers.find((line) => line.toLowerCase().startsWith("content-disposition:"));
    if (!dispositionLine) continue;

    const disposition = parseContentDisposition(dispositionLine);
    if (!disposition.name) continue;

    const typeLine = headers.find((line) => line.toLowerCase().startsWith("content-type:"));
    const parsedContentType = typeLine?.split(":")[1]?.trim() || "application/octet-stream";

    if (disposition.filename) {
      file = {
        fieldName: disposition.name,
        filename: disposition.filename,
        contentType: parsedContentType,
        buffer: content,
      };
      continue;
    }

    fields[disposition.name] = content.toString("utf8");
  }

  return { fields, file };
}
