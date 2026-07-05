import type { FastifyReply } from "fastify";

/**
 * Generic typed domain error. Subclass per module for a distinct `code` union
 * so callers can still `instanceof ModuleError` narrow — e.g.
 * `class OrderError extends DomainError<"not_found" | "forbidden"> {}`.
 * Replaces the 16 hand-written, byte-identical `XError` classes that existed
 * one per module before this was extracted.
 */
export class DomainError<Code extends string = string> extends Error {
  constructor(
    public code: Code,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Run a domain action, translating a thrown DomainError into the matching
 * HTTP response via the caller's own code→status map. Replaces the 14
 * byte-identical `run()` wrappers (plus several inline try/catch copies)
 * that existed one per module before this was extracted.
 */
export async function runDomain<T>(
  reply: FastifyReply,
  statusByCode: Record<string, number>,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) {
      await reply
        .code(statusByCode[err.code] ?? 500)
        .send({ error: { code: err.code, message: err.message } });
      return undefined;
    }
    throw err;
  }
}

/** One-off error response for the ad hoc `{ error: { code, message } }` sends outside runDomain. */
export async function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  await reply.code(status).send({ error: { code, message } });
}
