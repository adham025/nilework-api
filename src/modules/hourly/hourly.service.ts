import { getDb } from "@/core/db";
import { DomainError } from "@/core/errors";
import { getPublicConfig } from "@/modules/config/config.service";
import { freelancerTier, tierCommissionBps } from "@/modules/levels/levels.service";
import { notify } from "@/modules/notifications/notifications.service";
import { getOrder, insertOrder } from "@/modules/orders/orders.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type {
  HourlyContract,
  HourlyContractCreateInput,
  HourlyContractDetail,
  OrderDetail,
  TimeLog,
} from "@nilework/schemas";

/** Typed error so routes can map hourly-contract failures to HTTP codes. */
export class HourlyError extends DomainError<"not_found" | "forbidden" | "conflict"> {}

const C_COLUMNS = `
  id, client_id, freelancer_id, title, hourly_rate_usd_minor, status, created_at, updated_at
`;
const L_COLUMNS = "id, contract_id, minutes, description, status, order_id, created_at";

export async function createContract(
  clientId: string,
  input: HourlyContractCreateInput,
): Promise<HourlyContract> {
  if (input.freelancer_id === clientId) {
    throw new HourlyError("conflict", "You cannot contract yourself");
  }
  await ensureProfile(clientId);
  const sql = getDb();
  const freelancers = await sql<{ id: string }[]>`
    select id from public.profiles where id = ${input.freelancer_id} limit 1
  `;
  if (!freelancers[0]) throw new HourlyError("not_found", "Freelancer not found");

  const rows = await sql<HourlyContract[]>`
    insert into public.hourly_contracts (client_id, freelancer_id, title, hourly_rate_usd_minor)
    values (${clientId}, ${input.freelancer_id}, ${input.title}, ${input.hourly_rate_usd_minor})
    returning ${sql.unsafe(C_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  const contract = rows[0]!;
  await notify(input.freelancer_id, "hourly_contract", { contract_id: contract.id });
  return contract;
}

export async function listMyContracts(userId: string): Promise<HourlyContract[]> {
  const sql = getDb();
  return sql<HourlyContract[]>`
    select ${sql.unsafe(C_COLUMNS)} from public.hourly_contracts
    where client_id = ${userId} or freelancer_id = ${userId}
    order by created_at desc
  `;
}

async function loadContract(contractId: string, userId: string): Promise<HourlyContract> {
  const sql = getDb();
  const rows = await sql<HourlyContract[]>`
    select ${sql.unsafe(C_COLUMNS)} from public.hourly_contracts where id = ${contractId} limit 1
  `;
  const contract = rows[0];
  if (!contract) throw new HourlyError("not_found", "Contract not found");
  if (contract.client_id !== userId && contract.freelancer_id !== userId) {
    throw new HourlyError("not_found", "Contract not found");
  }
  return contract;
}

export async function getContractDetail(
  contractId: string,
  userId: string,
): Promise<HourlyContractDetail> {
  const contract = await loadContract(contractId, userId);
  const sql = getDb();
  const logs = await sql<TimeLog[]>`
    select ${sql.unsafe(L_COLUMNS)} from public.time_logs
    where contract_id = ${contractId} order by created_at desc
  `;
  return { ...contract, logs };
}

export async function logTime(
  contractId: string,
  freelancerId: string,
  minutes: number,
  description: string,
): Promise<TimeLog> {
  const contract = await loadContract(contractId, freelancerId);
  if (contract.freelancer_id !== freelancerId) {
    throw new HourlyError("forbidden", "Only the freelancer can log time");
  }
  if (contract.status !== "active") throw new HourlyError("conflict", "Contract is not active");

  const sql = getDb();
  const rows = await sql<TimeLog[]>`
    insert into public.time_logs (contract_id, minutes, description)
    values (${contractId}, ${minutes}, ${description})
    returning ${sql.unsafe(L_COLUMNS)}
  `;
  await notify(contract.client_id, "time_logged", { contract_id: contractId });
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  return rows[0]!;
}

export async function approveLog(
  contractId: string,
  logId: string,
  clientId: string,
): Promise<TimeLog> {
  const contract = await loadContract(contractId, clientId);
  if (contract.client_id !== clientId)
    throw new HourlyError("forbidden", "Only the client approves");

  const sql = getDb();
  const rows = await sql<TimeLog[]>`
    update public.time_logs set status = 'approved'
    where id = ${logId} and contract_id = ${contractId} and status = 'logged'
    returning ${sql.unsafe(L_COLUMNS)}
  `;
  const log = rows[0];
  if (!log) throw new HourlyError("conflict", "Log not found or not in a loggable state");
  return log;
}

/**
 * Bill all approved-but-unbilled time logs: generate one order (gross = hours ×
 * rate) through the shared insertOrder path, and mark those logs billed — atomic.
 * The client then pays it through the normal checkout → escrow → release flow.
 */
export async function billContract(contractId: string, clientId: string): Promise<OrderDetail> {
  const contract = await loadContract(contractId, clientId);
  if (contract.client_id !== clientId) throw new HourlyError("forbidden", "Only the client bills");

  const baseBps = (await getPublicConfig()).commission_bps;
  const tierBps = tierCommissionBps(await freelancerTier(contract.freelancer_id), baseBps);

  const sql = getDb();
  const orderId = await sql.begin(async (tx) => {
    const logs = await tx<{ id: string; minutes: number }[]>`
      select id, minutes from public.time_logs
      where contract_id = ${contractId} and status = 'approved' for update
    `;
    if (logs.length === 0) throw new HourlyError("conflict", "No approved hours to bill");

    const totalMinutes = logs.reduce((sum, l) => sum + l.minutes, 0);
    const gross = Math.round((totalMinutes * contract.hourly_rate_usd_minor) / 60);

    const order = await insertOrder(tx, {
      clientId: contract.client_id,
      freelancerId: contract.freelancer_id,
      gigId: null,
      title: `Hourly: ${contract.title}`,
      grossUsdMinor: gross,
      deliveryDays: 1,
      ...(tierBps !== baseBps ? { commissionBpsOverride: tierBps } : {}),
    });
    await tx`
      update public.time_logs set status = 'billed', order_id = ${order.id}
      where contract_id = ${contractId} and status = 'approved'
    `;
    return order.id;
  });

  return getOrder(orderId, clientId);
}
