import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export interface ResolvedStudent {
  id: string;
  name: string;
  email: string;
}

function anonKey(): string {
  return Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  const key = anonKey();
  if (!token || token === key) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// deno-lint-ignore no-explicit-any
export async function resolveStudent(db: any, user: User): Promise<ResolvedStudent | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const { data: linked } = await db
    .from("students")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (linked) return linked as ResolvedStudent;

  const { data: byEmail } = await db
    .from("students")
    .select("id, name, email, auth_user_id")
    .eq("email", email)
    .maybeSingle();
  if (!byEmail) return null;

  if (!byEmail.auth_user_id) {
    await db.from("students").update({ auth_user_id: user.id }).eq("id", byEmail.id);
  }

  return { id: byEmail.id, name: byEmail.name, email: byEmail.email };
}
