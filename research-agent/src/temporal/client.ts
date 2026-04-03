import { Client, Connection } from "@temporalio/client";

import type { AppConfig } from "../config.js";

export async function createTemporalClient(
  config: AppConfig,
  deps?: {
    connect?: typeof Connection.connect;
    ClientCtor?: typeof Client;
  },
): Promise<Client> {
  const connect = deps?.connect ?? Connection.connect;
  const ClientCtor = deps?.ClientCtor ?? Client;

  const connection = await connect({
    address: config.temporalAddress,
  });

  return new ClientCtor({
    connection,
    namespace: config.temporalNamespace,
  });
}
