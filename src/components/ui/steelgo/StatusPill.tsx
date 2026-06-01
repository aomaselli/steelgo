import { Badge } from './Badge';
import type { FreightStatus } from '@/types/database';

type Variant = 'gray' | 'blue' | 'amber' | 'green' | 'red';

const map: Record<FreightStatus, { variant: Variant; label: string; pulse?: string }> = {
  draft: { variant: 'gray', label: 'Rascunho' },
  published: { variant: 'blue', label: 'Publicado' },
  bidding: { variant: 'blue', label: 'Recebendo propostas', pulse: 'bg-[#3B89D4]' },
  matched: { variant: 'blue', label: 'Matched' },
  contract_pending: { variant: 'amber', label: 'Contrato pendente' },
  contracted: { variant: 'amber', label: 'Contratado' },
  in_transit: { variant: 'amber', label: 'Em trânsito', pulse: 'bg-[#F0A500]' },
  delivered: { variant: 'green', label: 'Entregue' },
  completed: { variant: 'green', label: 'Concluído' },
  cancelled: { variant: 'red', label: 'Cancelado' },
  disputed: { variant: 'red', label: 'Em disputa' },
};

export interface StatusPillProps {
  status: FreightStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <Badge variant={cfg.variant}>
      {cfg.pulse && (
        <span className={`animate-pulse inline-block w-1.5 h-1.5 rounded-full mr-1 ${cfg.pulse}`} />
      )}
      {cfg.label}
    </Badge>
  );
}
