import "server-only";

import { PDFParse } from "pdf-parse";

export type PdfTextExtractionResult = {
  parser: "pdf-parse";
  text: string;
};

export class PdfTextExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTextExtractionError";
  }
}

function toSafePdfErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown PDF parser error.";

  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function extractPdfTextFromBuffer(
  buffer: Buffer | Uint8Array,
): Promise<PdfTextExtractionResult> {
  const parser = new PDFParse({ data: Buffer.from(buffer) });

  try {
    const result = await parser.getText();

    return {
      parser: "pdf-parse",
      text: result.text ?? "",
    };
  } catch (error) {
    throw new PdfTextExtractionError(
      `PDF text extraction failed: ${toSafePdfErrorMessage(error)}`,
    );
  } finally {
    await parser.destroy();
  }
}
