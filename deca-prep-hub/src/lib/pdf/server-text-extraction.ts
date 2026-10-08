import "server-only";

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
  let parser: InstanceType<typeof import("pdf-parse").PDFParse> | undefined;

  try {
    // The worker installs Node's canvas globals before PDF.js evaluates DOMMatrix.
    // Sequential imports are intentional; static imports can crash the route at startup.
    const { CanvasFactory, getData } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(getData());
    parser = new PDFParse({ data: Buffer.from(buffer), CanvasFactory });
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
    await parser?.destroy().catch((error: unknown) => {
      console.error("[PDF parser] Cleanup failed", error);
    });
  }
}
