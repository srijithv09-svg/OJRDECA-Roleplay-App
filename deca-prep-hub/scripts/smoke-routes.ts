type SmokeRoute = {
  path: string;
  note?: string;
};

const sampleId = "00000000-0000-0000-0000-000000000000";
const routes: SmokeRoute[] = [
  { path: "/" },
  { path: "/login" },
  { path: "/dashboard" },
  { path: "/roleplays" },
  { path: "/exams" },
  { path: `/resources/${sampleId}`, note: "sample resource id" },
  { path: "/analytics" },
  { path: "/calendar" },
  { path: "/settings" },
  { path: "/admin/resources" },
  { path: "/admin/upload" },
  { path: "/admin/exam-keys" },
  { path: "/admin/analytics" },
  { path: "/admin/users" },
  { path: `/exams/${sampleId}/take`, note: "sample exam id" },
  { path: `/exams/attempts/${sampleId}`, note: "sample attempt id" },
  { path: `/roleplays/${sampleId}/practice`, note: "sample roleplay id" },
  { path: `/roleplays/attempts/${sampleId}`, note: "sample roleplay attempt id" },
];

function getBaseUrl() {
  return (process.env.SMOKE_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

async function fetchRoute(baseUrl: string, route: SmokeRoute) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl}${route.path}`, {
      redirect: "manual",
      signal: controller.signal,
    });

    return {
      route,
      status: response.status,
      statusText: response.statusText,
      ok: response.status < 500,
      location: response.headers.get("location"),
    };
  } catch (error) {
    return {
      route,
      status: 0,
      statusText: error instanceof Error ? error.message : "Request failed",
      ok: false,
      location: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const baseUrl = getBaseUrl();
  console.log(`Smoke testing routes at ${baseUrl}`);
  console.log("");

  const results = [];

  for (const route of routes) {
    results.push(await fetchRoute(baseUrl, route));
  }

  for (const result of results) {
    const marker = result.ok ? "OK" : "FAIL";
    const redirect = result.location ? ` -> ${result.location}` : "";
    const note = result.route.note ? ` (${result.route.note})` : "";
    console.log(
      `${marker} ${String(result.status).padStart(3, " ")} ${result.route.path}${redirect}${note}`,
    );
  }

  const failures = results.filter((result) => !result.ok);

  if (failures.length > 0) {
    console.log("");
    console.log(`Route smoke test failed for ${failures.length} route(s).`);
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Route smoke test passed. No route returned a server error.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Route smoke test failed.");
  process.exitCode = 1;
});
