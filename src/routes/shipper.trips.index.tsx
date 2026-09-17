import { createFileRoute } from "@tanstack/react-router";
import { TripListView } from "@/components/trip/TripListView";

export const Route = createFileRoute("/shipper/trips/")({
  component: () => (
    <TripListView
      scope="shipper"
      detailTo="/shipper/trips/$id"
      title="Viagens"
      subtitle="Acompanhe posição, estimativa de chegada, ocorrências e comprovante de entrega"
    />
  ),
});
