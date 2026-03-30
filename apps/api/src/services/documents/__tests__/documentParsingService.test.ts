import { writeFile } from "node:fs/promises";
import path from "node:path";
import { vi, describe, it, expect, beforeEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { extractDocumentText } from "../documentParsingService.js";

describe("extractDocumentText", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("returns plain text content for txt uploads", async () => {
    const parsed = await extractDocumentText({
      filename: "notes.txt",
      buffer: Buffer.from("  hello field notes  "),
    });

    expect(parsed).toEqual({
      text: "hello field notes",
      pageCount: null,
      pages: null,
    });
  });

  it("uses pdftotext output when embedded pdf text is available", async () => {
    execFileMock.mockImplementation((file: string, args: string[], callback: Function) => {
      if (file === "pdftotext") {
        const outputPath = args[2];
        writeFile(outputPath, "Page one\fPage two")
          .then(() => callback(null, { stdout: "", stderr: "" }))
          .catch((error) => callback(error));
        return;
      }
      callback(new Error(`unexpected command: ${file}`));
    });

    const parsed = await extractDocumentText({
      filename: "manual.pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });

    expect(parsed).toEqual({
      text: "Page one\n\nPage two",
      pageCount: 2,
      pages: [
        { page_number: 1, text: "Page one" },
        { page_number: 2, text: "Page two" },
      ],
    });
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to OCR when pdftotext finds no usable text", async () => {
    execFileMock.mockImplementation((file: string, args: string[], callback: Function) => {
      if (file === "pdftotext") {
        const outputPath = args[2];
        writeFile(outputPath, "\f   \f")
          .then(() => callback(null, { stdout: "", stderr: "" }))
          .catch((error) => callback(error));
        return;
      }

      if (file === "pdftoppm") {
        const imagePrefix = args[2];
        Promise.all([
          writeFile(`${imagePrefix}-1.png`, "page1"),
          writeFile(`${imagePrefix}-2.png`, "page2"),
        ])
          .then(() => callback(null, { stdout: "", stderr: "" }))
          .catch((error) => callback(error));
        return;
      }

      if (file === "tesseract") {
        const imagePath = args[0];
        const imageName = path.basename(imagePath);
        const stdout = imageName === "page-1.png" ? "Scanned page one" : "Scanned page two";
        callback(null, { stdout, stderr: "" });
        return;
      }

      callback(new Error(`unexpected command: ${file}`));
    });

    const parsed = await extractDocumentText({
      filename: "scanned.pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });

    expect(parsed).toEqual({
      text: "Scanned page one\n\nScanned page two",
      pageCount: 2,
      pages: [
        { page_number: 1, text: "Scanned page one" },
        { page_number: 2, text: "Scanned page two" },
      ],
    });
  });

  it("throws when pdf extraction tooling is unavailable", async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], callback: Function) => {
      callback(new Error("missing"));
    });

    await expect(extractDocumentText({
      filename: "broken.pdf",
      buffer: Buffer.from("%PDF-1.7"),
    })).rejects.toThrow("pdf_text_extraction_unavailable");
  });
});
