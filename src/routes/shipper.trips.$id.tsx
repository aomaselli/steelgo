import { createFileRoute, useParams } from "@tanstack/react-router";
import { TripDetailView } from "@/components/trip/TripDetailView";

// Modulo 3: detalhe da viagem via get_trip (RPC sanitizada por papel).
export const Route = createFileRoute("/shipper/trips/$id")({
  component: ShipperTripPage,
});

function ShipperTripPage() {
  const { id } = useParams({ from: "/shipper/trips/$id" });
  return <TripDetailView tripId={id} backTo="/shipper/trips" />;
}
