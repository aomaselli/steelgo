// Estado do push (lib/pushClient) para componentes. Nao pede permissao: so observa.
import { useEffect, useState } from "react";
import { getPushStatus, subscribePush, type PushStatus } from "@/lib/pushClient";

export function usePushStatus(): PushStatus {
  const [s, setS] = useState<PushStatus>(getPushStatus());
  useEffect(() => subscribePush(setS), []);
  return s;
}
