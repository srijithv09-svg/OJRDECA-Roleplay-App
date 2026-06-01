import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { detectDecaEventCodeFromText } from "../src/lib/deca/events";
import { detectResourceMetadata } from "../src/lib/resources/metadata-detection";

type ResourceType = "roleplay" | "exam" | "reference" | "unknown";

type ClassificationResult = {
  resourceType: ResourceType;
  reason: string;
};

type ImportMetadata = {
  title: string;
  resource_type: ResourceType;
  cluster: string | null;
  event_category: string | null;
  event_code: string | null;
  event_name: string | null;
  instructional_area: string | null;
  performance_indicators: string[] | null;
  performance_indicators_reviewed: boolean;
  year: number | null;
  original_filename: string;
};

type ResourceInsert = ImportMetadata & {
  approval_status: "pending";
  detected_text: string | null;
  file_path: string;
  storage_path: string;
  import_notes: string;
};

type Summary = {
  imported: number;
  skippedDuplicates: number;
  roleplays: number;
  exams: number;
  references: number;
  unknown: number;
  failed: number;
};

const RAW_PDFS_DIR = path.resolve(process.cwd(), process.env.IMPORT_PDF_DIR ?? "import_data/raw_pdfs");
const STORAGE_BUCKET = "resources";
const MAX_DETECTED_TEXT_LENGTH = 12000;
const DRY_RUN = process.env.DRY_RUN?.toLowerCase() === "true";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getSupabaseCredentials() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL. Expected a full https://...supabase.co URL.",
    );
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY for imports, or NEXT_PUBLIC_SUPABASE_ANON_KEY if your policies allow inserts and uploads.",
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE) {
    console.warn(
      "Warning: using NEXT_PUBLIC_SUPABASE_ANON_KEY. Uploads/inserts may fail unless Storage and table policies allow anon writes.",
    );
  }

  return { supabaseKey, supabaseUrl };
}

async function scanPdfFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return scanPdfFiles(fullPath);
      }

      return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [fullPath] : [];
    }),
  );

  return files.flat().sort((a, b) => a.localeCompare(b));
}

function normalizeText(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripLeadingAssetId(filename: string) {
  return filename.replace(/^[a-f0-9]{16,}[_-]/i, "");
}

function titleFromFilename(filename: string) {
  const withoutExtension = filename.replace(/\.pdf$/i, "");
  const withoutId = stripLeadingAssetId(withoutExtension);
  return normalizeText(withoutId);
}

function toMatchText(value: string) {
  return value.replace(/\\/g, "/");
}

function classifyResource(filePath: string): ClassificationResult {
  const filename = path.basename(filePath);
  const relativePath = toMatchText(path.relative(RAW_PDFS_DIR, filePath));
  const filenameText = toMatchText(filename);
  const pathText = toMatchText(relativePath);
  const normalizedPath = normalizeText(pathText).toLowerCase();
  const eventCode = detectDecaEventCodeFromText(pathText);

  if (
    /performance[-_\s]?indicators/i.test(filenameText) ||
    /exam[-_\s]?blueprint/i.test(filenameText) ||
    /\bblueprint\b/i.test(filenameText)
  ) {
    return {
      reason: "filename contains performance indicators or blueprint",
      resourceType: "reference",
    };
  }

  if (
    /\bexam\b/i.test(filenameText) ||
    normalizedPath.includes("cluster sample exam") ||
    normalizedPath.includes("sample exam") ||
    /cluster[_\s-]?sample[_\s-]?exam/i.test(pathText) ||
    /sample[_\s-]?exam/i.test(pathText) ||
    /HS[_\s-]?Finance[_\s-]?Cluster[_\s-]?Sample[_\s-]?Exam/i.test(pathText) ||
    /C25[_\s-]?HS[_\s-]?FIN[_\s-]?exam/i.test(pathText)
  ) {
    return {
      reason: "filename or path contains exam pattern",
      resourceType: "exam",
    };
  }

  if (/(^|\/)Roleplays(\/|$)/i.test(pathText)) {
    return {
      reason: "path includes /Roleplays/",
      resourceType: "roleplay",
    };
  }

  if (/\b(District_Event|District Event|ICDC|Preliminary)\b/i.test(pathText)) {
    return {
      reason: "filename or path contains roleplay event marker",
      resourceType: "roleplay",
    };
  }

  if (eventCode) {
    return {
      reason: `filename or path contains event acronym ${eventCode}`,
      resourceType: "roleplay",
    };
  }

  return {
    reason: "no filename or path classification rule matched",
    resourceType: "unknown",
  };
}

function detectYear(searchText: string): number | null {
  const cYearMatch = searchText.match(/\bC(\d{2})\b/i);

  if (cYearMatch) {
    return 2000 + Number(cYearMatch[1]);
  }

  const shortYearMatch = searchText.match(/\b(20|21|22|23|24|25|26)[_\s-]?HS\b/i);

  if (shortYearMatch) {
    return 2000 + Number(shortYearMatch[1]);
  }

  const fullYearMatch = searchText.match(/\b(20\d{2})\b/);

  return fullYearMatch ? Number(fullYearMatch[1]) : null;
}

function detectPerformanceIndicators(text: string): string[] | null {
  const indicators = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

  for (const line of lines) {
    if (/performance indicator/i.test(line)) {
      const cleaned = line
        .replace(/^performance indicators?[:\s-]*/i, "")
        .replace(/^pi[:\s-]*/i, "")
        .trim();

      if (cleaned.length > 6 && cleaned.length < 220) {
        indicators.add(cleaned);
      }
    }
  }

  const sectionMatch = text.match(
    /performance indicators?([\s\S]{0,1200}?)(?:instructional area|participant instructions|case study|judging|$)/i,
  );

  if (sectionMatch) {
    for (const rawLine of sectionMatch[1].split(/\r?\n/)) {
      const cleaned = normalizeText(rawLine.replace(/^[-*•\d.)\s]+/, ""));

      if (cleaned.length > 12 && cleaned.length < 220) {
        indicators.add(cleaned);
      }
    }
  }

  return indicators.size > 0 ? [...indicators].slice(0, 12) : null;
}

async function extractPdfText(filePath: string) {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

function createMetadata(
  filePath: string,
  text: string,
  classification: ClassificationResult,
): ImportMetadata {
  const originalFilename = path.basename(filePath);
  const relativePath = path.relative(RAW_PDFS_DIR, filePath);
  const folderText = path.dirname(relativePath).split(path.sep).join(" ");
  const detected = detectResourceMetadata(originalFilename, `${folderText} ${text.slice(0, 800)}`);

  const metadata: ImportMetadata = {
    title: detected.title || titleFromFilename(originalFilename),
    resource_type: classification.resourceType,
    cluster: detected.cluster,
    event_category: detected.event_category,
    event_code: detected.event_code,
    event_name: detected.event_name,
    instructional_area: detected.instructional_area,
    performance_indicators:
      classification.resourceType === "roleplay" ? detectPerformanceIndicators(text) : null,
    performance_indicators_reviewed: false,
    year: detected.year ?? detectYear(`${originalFilename} ${folderText}`),
    original_filename: originalFilename,
  };

  return metadata;
}

function storagePathFor(metadata: ImportMetadata) {
  const safeFilename = stripLeadingAssetId(metadata.original_filename)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-");
  const year = metadata.year?.toString() ?? "unknown-year";

  return `${metadata.resource_type}/${year}/${safeFilename}`;
}

function counterKey(resourceType: ResourceType): keyof Pick<
  Summary,
  "roleplays" | "exams" | "references" | "unknown"
> {
  if (resourceType === "roleplay") {
    return "roleplays";
  }

  if (resourceType === "exam") {
    return "exams";
  }

  if (resourceType === "reference") {
    return "references";
  }

  return "unknown";
}

async function main() {
  if (!existsSync(RAW_PDFS_DIR)) {
    throw new Error(`Raw PDF directory not found: ${RAW_PDFS_DIR}`);
  }

  const pdfFiles = await scanPdfFiles(RAW_PDFS_DIR);

  const summary: Summary = {
    imported: 0,
    skippedDuplicates: 0,
    roleplays: 0,
    exams: 0,
    references: 0,
    unknown: 0,
    failed: 0,
  };

  console.log(`Found ${pdfFiles.length} PDF file(s) in ${RAW_PDFS_DIR}`);
  console.log(`Dry run: ${DRY_RUN ? "true" : "false"}`);

  const supabase = DRY_RUN
    ? null
    : (() => {
        const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
        return createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
      })();

  if (supabase) {
    const { data: bucket, error: getBucketError } =
      await supabase.storage.getBucket(STORAGE_BUCKET);

    if (!bucket) {
      if (getBucketError) {
        console.warn(
          `Storage bucket lookup failed for "${STORAGE_BUCKET}": ${getBucketError.message}. Attempting to create it.`,
        );
      }

      const { error: createBucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        allowedMimeTypes: ["application/pdf"],
        public: false,
      });

      if (createBucketError) {
        throw new Error(
          `Storage bucket "${STORAGE_BUCKET}" is missing and could not be created: ${createBucketError.message}`,
        );
      }
    }
  }

  for (const filePath of pdfFiles) {
    const originalFilename = path.basename(filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    const classification = classifyResource(filePath);

    console.log(
      [
        `File: ${originalFilename}`,
        `Path: ${relativePath}`,
        `Classification: ${classification.resourceType}`,
        `Reason: ${classification.reason}`,
      ].join("\n"),
    );

    try {
      if (DRY_RUN) {
        summary.imported += 1;
        summary[counterKey(classification.resourceType)] += 1;
        console.log("Dry run: skipped duplicate check, upload, and insert.\n");
        continue;
      }

      if (!supabase) {
        throw new Error("Supabase client was not initialized.");
      }

      const { data: duplicate, error: duplicateError } = await supabase
        .from("resources")
        .select("id")
        .eq("original_filename", originalFilename)
        .maybeSingle();

      if (duplicateError) {
        throw new Error(`Duplicate check failed: ${duplicateError.message}`);
      }

      if (duplicate) {
        summary.skippedDuplicates += 1;
        console.log(`Skipped duplicate: ${originalFilename}`);
        continue;
      }

      const text = await extractPdfText(filePath);
      const metadata = createMetadata(filePath, text, classification);
      const storagePath = storagePathFor(metadata);
      const fileBuffer = await readFile(filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const uploadedPath = uploadData.path ?? storagePath;

      const insertPayload: ResourceInsert = {
        ...metadata,
        approval_status: "pending",
        detected_text: text.slice(0, MAX_DETECTED_TEXT_LENGTH) || null,
        file_path: uploadedPath,
        storage_path: uploadedPath,
        import_notes: `Imported locally from ${path.relative(process.cwd(), filePath)}`,
      };

      const { error: insertError } = await supabase.from("resources").insert(insertPayload);

      if (insertError) {
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      summary.imported += 1;
      summary[counterKey(metadata.resource_type)] += 1;
      console.log(`Imported ${metadata.resource_type}: ${originalFilename}`);
    } catch (error) {
      summary.failed += 1;
      console.error(
        `Failed to import ${originalFilename}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  console.log("\nImport summary");
  console.log(`Imported count: ${summary.imported}`);
  console.log(`Skipped duplicates: ${summary.skippedDuplicates}`);
  console.log(`Roleplays: ${summary.roleplays}`);
  console.log(`Exams: ${summary.exams}`);
  console.log(`References: ${summary.references}`);
  console.log(`Unknown: ${summary.unknown}`);
  console.log(`Failed: ${summary.failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
