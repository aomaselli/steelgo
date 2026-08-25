import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { OperationsBoard } from "@/components/operations/OperationsBoard";

export const Route = createFileRoute("/carrier/active")({
  component: CarrierActivePage,
});

function CarrierActivePage() {
  const { company } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#10274A]">{t("carrierActive.title")}</h1>
        <p className="mt-1 text-sm text-[#5B6B80]">{t("carrierActive.subtitle")}</p>
      </div>
      <OperationsBoard scope="carrier" companyId={company?.id} defaultFilter="active" />
    </div>
  );
}
