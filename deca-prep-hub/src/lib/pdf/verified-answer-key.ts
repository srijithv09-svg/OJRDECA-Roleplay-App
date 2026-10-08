import "server-only";
import { verifyPrintedAnswerKeys } from "../exams/answer-key-verification";
import { extractPdfTextFromBuffer } from "./server-text-extraction";

async function readWithSecondParser(buffer: Uint8Array): Promise<string> {
  // Suppress the library's per-link warnings; failures are logged by this wrapper.
  process.env.PDF2JSON_DISABLE_LOGS ??= "1";
  const { default: PDFParser } = await import("pdf2json");
  const parser = new PDFParser(null, true);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Second PDF reader timed out.")), 20_000);
    function finish(error?: unknown, text?: string) {
      clearTimeout(timer);
      parser.removeAllListeners();
      parser.destroy();
      if (error) reject(error); else resolve(text ?? "");
    }
    parser.on("pdfParser_dataError", (error) => finish(error));
    parser.on("pdfParser_dataReady", () => {
      try { finish(undefined, parser.getRawTextContent()); } catch (error) { finish(error); }
    });
    try { parser.parseBuffer(Buffer.from(buffer), 0); } catch (error) { finish(error); }
  });
}

export async function readVerifiedPdfAnswerKey(buffer: Uint8Array) {
  // Run sequentially to bound memory and keep both readers' runtime initialization isolated.
  const first = await extractPdfTextFromBuffer(buffer).then((result) => result.text).catch((error: unknown) => {
    console.error("[exam keys] Primary PDF reader failed", error); return null;
  });
  const second = await readWithSecondParser(buffer).catch((error: unknown) => {
    console.error("[exam keys] Second PDF reader failed", error); return null;
  });
  return verifyPrintedAnswerKeys([first, second]);
}
