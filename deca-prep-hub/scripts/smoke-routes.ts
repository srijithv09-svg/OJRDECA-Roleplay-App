type RouteGroup =
  | "admin-protected"
  | "dynamic-sample"
  | "expected-redirect"
  | "protected"
  | "public";

type SmokeRoute = {
  expectedRedirect?: boolean;
  group: RouteGroup;
  note?: string;
  path: string;
  validStatuses: number[];
};

type SmokeResult = {
  error: string | null;
  location: string | null;
  ok: boolean;
  reason: string;
  route: SmokeRoute;
  status: number;
  statusText: string;
};

const sampleId = "00000000-0000-0000-0000-000000000000";
const publicStatuses = [200, 301, 302, 303, 307, 308];
const protectedStatuses = [200, 301, 302, 303, 307, 308];
const dynamicSampleStatuses = [200, 301, 302, 303, 307, 308, 404];

const routeGroups: Array<{ label: string; routes: SmokeRoute[] }> = [
  {
    label: "Public routes",
    routes: [
      { group: "public", path: "/", validStatuses: publicStatuses },
      { group: "public", path: "/login", validStatuses: publicStatuses },
      { group: "public", path: "/calendar", validStatuses: publicStatuses },
    ],
  },
  {
    label: "Protected student routes",
    routes: [
      {
        expectedRedirect: true,
        group: "protected",
        path: "/dashboard",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "protected",
        path: "/roleplays",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "protected",
        path: "/exams",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "protected",
        path: "/resources",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "protected",
        path: "/analytics",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "protected",
        path: "/settings",
        validStatuses: protectedStatuses,
      },
    ],
  },
  {
    label: "Admin/advisor protected routes",
    routes: [
      {
        expectedRedirect: true,
        group: "admin-protected",
        path: "/admin/resources",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "admin-protected",
        path: "/admin/upload",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "admin-protected",
        path: "/admin/exam-keys",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "admin-protected",
        path: "/admin/analytics",
        validStatuses: protectedStatuses,
      },
      {
        expectedRedirect: true,
        group: "admin-protected",
        path: "/admin/users",
        validStatuses: protectedStatuses,
      },
    ],
  },
  {
    label: "Dynamic sample routes",
    routes: [
      {
        expectedRedirect: true,
        group: "dynamic-sample",
        note: "fake resource id may redirect or render not-found state",
        path: `/resources/${sampleId}`,
        validStatuses: dynamicSampleStatuses,
      },
      {
        expectedRedirect: true,
        group: "dynamic-sample",
        note: "fake exam id may redirect or return 404",
        path: `/exams/${sampleId}/take`,
        validStatuses: dynamicSampleStatuses,
      },
      {
        expectedRedirect: true,
        group: "dynamic-sample",
        note: "fake attempt id may redirect or return 404",
        path: `/exams/attempts/${sampleId}`,
        validStatuses: dynamicSampleStatuses,
      },
      {
        expectedRedirect: true,
        group: "dynamic-sample",
        note: "fake roleplay id may redirect or return 404",
        path: `/roleplays/${sampleId}/practice`,
        validStatuses: dynamicSampleStatuses,
      },
      {
        expectedRedirect: true,
        group: "dynamic-sample",
        note: "fake roleplay attempt id may redirect or return 404",
        path: `/roleplays/attempts/${sampleId}`,
        validStatuses: dynamicSampleStatuses,
      },
    ],
  },
];

function getBaseUrl() {
  return (process.env.SMOKE_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function formatStatuses(statuses: number[]) {
  return statuses.join(",");
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

function getPassReason(route: SmokeRoute, status: number, location: string | null) {
  if (isRedirectStatus(status)) {
    return route.expectedRedirect
      ? `redirect accepted${location ? ` to ${location}` : ""}`
      : `redirect accepted${location ? ` to ${location}` : ""}`;
  }

  if (status === 404) {
    return "fake dynamic id returned 404 without crashing";
  }

  if (route.expectedRedirect && status === 200) {
    return "server returned app shell; client auth may redirect in browser";
  }

  return "status matched expectation";
}

async function fetchRoute(baseUrl: string, route: SmokeRoute): Promise<SmokeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl}${route.path}`, {
      redirect: "manual",
      signal: controller.signal,
    });
    const status = response.status;
    const location = response.headers.get("location");
    const ok = route.validStatuses.includes(status);

    return {
      error: null,
      location,
      ok,
      reason: ok
        ? getPassReason(route, status, location)
        : `unexpected status; expected one of ${formatStatuses(route.validStatuses)}`,
      route,
      status,
      statusText: response.statusText,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fetch failed before a response was received.";

    return {
      error: message,
      location: null,
      ok: false,
      reason:
        "fetch failed before a response was received; confirm the app server is running and SMOKE_BASE_URL is correct",
      route,
      status: 0,
      statusText: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const baseUrl = getBaseUrl();
  console.log(`Smoke testing routes at ${baseUrl}`);
  console.log("Start the app first, for example: npm run dev");
  console.log("");

  const results: SmokeResult[] = [];

  for (const group of routeGroups) {
    console.log(group.label);

    for (const route of group.routes) {
      const result = await fetchRoute(baseUrl, route);
      results.push(result);

      const marker = result.ok ? "PASS" : "FAIL";
      const redirect = result.location ? ` redirect=${result.location}` : "";
      const error = result.error ? ` error=${result.error}` : "";
      const note = route.note ? ` note=${route.note}` : "";
      console.log(
        `${marker} ${route.path} status=${result.status} expected=${formatStatuses(
          route.validStatuses,
        )} group=${route.group} redirectExpected=${route.expectedRedirect ? "yes" : "no"} reason=${
          result.reason
        }${redirect}${error}${note}`,
      );
    }

    console.log("");
  }

  const failures = results.filter((result) => !result.ok);
  const fetchFailures = failures.filter((result) => result.status === 0);

  if (failures.length > 0) {
    console.log(`Route smoke test failed for ${failures.length} route(s).`);

    if (fetchFailures.length > 0) {
      console.log(
        "At least one route returned status=0, which means fetch did not receive an HTTP response. This usually means the dev/start server is not running, the wrong base URL was used, or the request timed out.",
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log("Route smoke test passed. No route returned an unexpected status or server error.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Route smoke test failed.");
  process.exitCode = 1;
});
