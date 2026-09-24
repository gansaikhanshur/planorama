import { getSession } from "@/lib/session";
import { ReviewWorkspace } from "@/components/review-workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    return <ReviewWorkspace initial={await getSession()} />;
  } catch (error) {
    return (
      <main className="load-error">
        <h1>This plan needs a fresh look.</h1>
        <p>
          {error instanceof Error
            ? error.message
            : "Could not open the review session."}
        </p>
        <p>Check the plan file, then restart the local Planorama launcher.</p>
      </main>
    );
  }
}
