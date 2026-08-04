import { createFileRoute } from "@tanstack/react-router";
import { EvaDashboard } from "@/components/eva/EvaDashboard";

export const Route = createFileRoute("/_authenticated/s/$threadId")({
  head: () => ({
    meta: [
      { title: "EVA Session: Executive Virtual Assistant Deck" },
      {
        name: "description",
        content:
          "A saved EVA session: conversation memory, voice control, workspace file agent and a timestamped disk audit log.",
      },
      { property: "og:title", content: "EVA Session: Executive Virtual Assistant Deck" },
      {
        property: "og:description",
        content:
          "Resume a stored EVA conversation with full memory, live telemetry and the workspace audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { threadId } = Route.useParams();
  return <EvaDashboard threadId={threadId} />;
}
