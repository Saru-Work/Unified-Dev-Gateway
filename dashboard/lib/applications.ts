import { notFound } from "next/navigation";
import { cache } from "react";
import { backend, BackendError } from "./backend";
import { requireUser } from "./session";
import type { Application } from "./types";

/**
 * Loads one of the signed-in user's applications, or renders the 404 page.
 * Cached per request, so metadata and page share one backend call.
 */
export const getApplication = cache(async (id: string): Promise<Application> => {
  const { token } = await requireUser();
  try {
    const { application } = await backend<{ application: Application }>(
      `/applications/${encodeURIComponent(id)}`,
      { token },
    );
    return application;
  } catch (err) {
    // The backend answers 404 for unknown ids and other users' apps alike.
    if (err instanceof BackendError && err.status === 404) notFound();
    throw err;
  }
});
