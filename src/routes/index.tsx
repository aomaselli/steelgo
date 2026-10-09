import { createFileRoute } from "@tanstack/react-router";
import { HomeV5 } from "@/components/home-v5/HomeV5";

// Replaces the previous composition (Navbar + 10 sections + Footer + WhatsAppButton).
// The old components in src/components/homepage/ are left untouched; delete them only
// after the review, in a separate commit.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SteelGo — A infraestrutura digital logística da América Latina" },
      {
        name: "description",
        content: "Tecnologia para conectar embarcadores, transportadoras e motoristas, integrando fretes, documentos, pagamentos e rastreamento em uma única operação.",
      },
      { property: "og:title", content: "SteelGo — A infraestrutura digital logística da América Latina" },
      { property: "og:description", content: "Tecnologia para conectar embarcadores, transportadoras e motoristas em operações logísticas mais seguras, visíveis e eficientes." },
    ],
  }),
  component: HomeV5,
});
