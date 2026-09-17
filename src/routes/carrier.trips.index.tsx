import { createFileRoute } from "@tanstack/react-router";
import { TripListView } from "@/components/trip/TripListView";

// Modulo 3: viagens operacionais (list_my_trips), nao mais a lista de contratos.
export const Route = createFileRoute("/carrier/trips/")({
  component: () => (
    <TripListView
      scope="carrier"
      detailTo="/carrier/trips/$id"
      title="Viagens"
      subtitle="Operação em tempo real: designação, rastreamento, ocorrências e comprovantes"
    />
  ),
});
