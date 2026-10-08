import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "pdfjs-dist", "pdf2json"],
  outputFileTracingIncludes: {
    "/api/admin/exam-keys/*/extract": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/pdf-parse/dist/worker/**/*",
    ],
  },
};

export default nextConfig;
