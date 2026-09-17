import { createFileRoute, useParams } from "@tanstack/react-router";
import { TripDetailView } from "@/components/trip/TripDetailView";

// Modulo 3: detalhe da viagem via get_trip (RPC sanitizada por papel).
export const Route = createFileRoute("/admin/operations/$id")({
  component: AdminTripPage,
});

function AdminTripPage() {
  const { id } = useParams({ from: "/admin/operations/$id" });
  return <TripDetailView tripId={id} backTo="/admin/operations" />;
}
