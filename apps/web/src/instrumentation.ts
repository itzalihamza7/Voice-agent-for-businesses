import type { Instrumentation } from "next";

// Error tracking: every unhandled error in a page or route is logged as one JSON line with the
// route and request, so a log service (or Sentry's log drain) can group and alert on them.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      message: err.message,
      digest: err.digest,
      stack: err.stack?.split("\n").slice(0, 6).join("\n"),
      method: request.method,
      path: request.path,
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
