import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

function buildParsedDocument(
  pages: Array<{ page_number: number; text: string }>,
  pageCountOverride?: number | null
): ParsedDocumentText {
  return {
    text: pages.map((page) => page.text).join("\n\n").trim(),
    pageCount: pageCountOverride ?? (pages.length > 0 ? pages.length : null),
    pages: pages.length > 0 ? pages : null,
  };
}

function normalizeParsedPages(rawText: string) {
  return rawText
    .split("\f")
    .map((pageText, index) => ({
      page_number: index + 1,
      text: pageText.trim(),
    }))
    .filter((page) => page.text.length > 0);
}

function hasUsableExtractedText(parsed: ParsedDocumentText) {
  if (parsed.text.trim().length > 0) return true;
  return parsed.pages?.some((page) => page.text.trim().length > 0) ?? false;
}

async function getPdfPageCount(inputPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [inputPath]);
    const match = stdout.match(/Pages:\s*(\d+)/);
    if (!match) return null;
    const count = Number(match[1]);
    return Number.isFinite(count) && count > 0 ? count : null;
  } catch {
    return null;
  }
}

async function extractPdfTextWithCli(buffer: Buffer): Promise<ParsedDocumentText> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mazer-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.txt");

  try {
    await writeFile(inputPath, buffer);

    // Try per-page extraction first using pdfinfo + pdftotext -f -l. This makes
    // page_number authoritative from the PDF rather than inferred by counting
    // form-feed characters, which mis-aligns on PDFs with quirky layouts.
    const pageCount = await getPdfPageCount(inputPath);
    if (pageCount && pageCount > 0) {
      const pages: Array<{ page_number: number; text: string }> = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        try {
          const { stdout } = await execFileAsync("pdftotext", [
            "-layout",
            "-f", String(pageNumber),
            "-l", String(pageNumber),
            inputPath,
            "-",
          ]);
          const trimmed = stdout.trim();
          if (trimmed.length > 0) {
            pages.push({ page_number: pageNumber, text: trimmed });
          }
        } catch {
          // Skip a single bad page; do not fail the whole extraction.
        }
      }
      if (pages.length > 0) {
        return buildParsedDocument(pages, pageCount);
      }
    }

    // Fallback: original whole-file extraction split by form feed. Used when
    // pdfinfo is unavailable or per-page extraction yielded nothing.
    await execFileAsync("pdftotext", ["-layout", inputPath, outputPath]);
    const rawText = await readFile(outputPath, "utf8");
    return buildParsedDocument(normalizeParsedPages(rawText));
  } catch {
    throw new Error("pdf_text_extraction_unavailable");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function extractPdfTextWithOcr(buffer: Buffer): Promise<ParsedDocumentText> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mazer-pdf-ocr-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const imagePrefix = path.join(tmpDir, "page");

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("pdftoppm", ["-png", inputPath, imagePrefix]);

    const imagePaths = (await readdir(tmpDir))
      .filter((entry) => /^page-\d+\.png$/i.test(entry))
      .sort((left, right) => {
        const leftPage = Number(left.match(/page-(\d+)\.png/i)?.[1] ?? 0);
        const rightPage = Number(right.match(/page-(\d+)\.png/i)?.[1] ?? 0);
        return leftPage - rightPage;
      })
      .map((entry) => path.join(tmpDir, entry));

    const pagesWithText = await Promise.all(imagePaths.map(async (imagePath, index) => {
      const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "--psm", "6"]);
      return {
        page_number: index + 1,
        text: stdout.trim(),
      };
    }));

    const pages = pagesWithText.filter((page) => page.text.length > 0);
    return buildParsedDocument(pages, imagePaths.length > 0 ? imagePaths.length : null);
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
    const parsed = await extractPdfTextWithCli(args.buffer);
    if (hasUsableExtractedText(parsed)) {
      return parsed;
    }
    return extractPdfTextWithOcr(args.buffer);
  }

  throw new Error("unsupported_format");
}
