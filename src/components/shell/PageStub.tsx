import { Construction } from "lucide-react";
import { EmptyState } from "@/components/steel";

export function PageStub({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-graphite-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-graphite-400">{description}</p>}
      </div>
      <EmptyState
        icon={Construction}
        title="Em construção"
        description="Esta área será implementada nos próximos módulos."
      />
    </div>
  );
}
