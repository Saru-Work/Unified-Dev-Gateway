import type { NextRequest } from "next/server";
import { backendText, BackendError, describeError } from "@/lib/backend";
import { requireUser } from "@/lib/session";

/** Downloads the signed-in user's usage as CSV, without the browser needing a token. */
export async function GET(request: NextRequest) {
  const { token } = await requireUser();
  const range = request.nextUrl.searchParams.get("range") ?? "24h";
  try {
    const csv = await backendText(`/usage.csv?range=${encodeURIComponent(range)}`, { token });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // `range` was accepted by the backend, so it's one of the known values.
        "Content-Disposition": `attachment; filename="opengate-usage-${range}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return new Response(describeError(err), { status: err instanceof BackendError ? err.status : 500 });
  }
}
