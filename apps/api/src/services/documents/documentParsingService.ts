import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ParsedDocumentText = {
  text: string;
  pageCount: number | null;
  pages: Array<{
    page_number: number;
    text: string;
  }> | null;
};

function getFileExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

async function extractPdfTextWithCli(buffer: Buffer): Promise<ParsedDocumentText> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mazer-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.txt");

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("pdftotext", ["-layout", inputPath, outputPath]);
    const rawText = await readFile(outputPath, "utf8");
    const pages = rawText
      .split("\f")
      .map((pageText) => pageText.trim())
      .filter(Boolean)
      .map((pageText, index) => ({
        page_number: index + 1,
        text: pageText,
      }));
    return {
      text: pages.map((page) => page.text).join("\n\n").trim(),
      pageCount: pages.length > 0 ? pages.length : null,
      pages: pages.length > 0 ? pages : null,
    };
  } catch {
    throw new Error("pdf_text_extraction_unavailable");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function extractDocumentText(args: {
  filename: string;
  buffer: Buffer;
}): Promise<ParsedDocumentText> {
  const extension = getFileExtension(args.filename);

  if (extension === ".txt" || extension === ".md") {
    return {
      text: args.buffer.toString("utf8").trim(),
      pageCount: null,
      pages: null,
    };
  }

  if (extension === ".pdf") {
    return extractPdfTextWithCli(args.buffer);
  }

  throw new Error("unsupported_format");
}
