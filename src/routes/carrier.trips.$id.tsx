import { createFileRoute, useParams } from "@tanstack/react-router";
import { TripDetailView } from "@/components/trip/TripDetailView";

// Modulo 3: detalhe da viagem via get_trip (RPC sanitizada por papel).
export const Route = createFileRoute("/carrier/trips/$id")({
  component: CarrierTripPage,
});

function CarrierTripPage() {
  const { id } = useParams({ from: "/carrier/trips/$id" });
  return <TripDetailView tripId={id} backTo="/carrier/trips" />;
}
