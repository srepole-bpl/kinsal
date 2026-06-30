export type AuditActor = "instructor" | "system" | "student";

export interface AuditEntry {
  id: string;
  actor: AuditActor;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// deno-lint-ignore no-explicit-any
export async function writeAudit(
  db: any,
  actor: AuditActor,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.from("audit_log").insert({
      actor,
      action,
      detail: detail ?? null,
    });
  } catch (e) {
    console.error("audit write failed:", e);
  }
}

// deno-lint-ignore no-explicit-any
export async function getRecentAuditLog(
  db: any,
  limit = 50,
): Promise<AuditEntry[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const { data } = await db
    .from("audit_log")
    .select("id, actor, action, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(capped);
  return (data || []) as AuditEntry[];
}
