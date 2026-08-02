import { supabase } from "@/integrations/supabase/client";

export type ThreadRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type AuditRow = {
  id: string;
  action: string;
  path: string | null;
  ok: boolean;
  detail: string | null;
  source: string;
  created_at: string;
};

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listThreads(): Promise<ThreadRow[]> {
  const { data, error } = await supabase
    .from("eva_threads")
    .select("id,title,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ThreadRow[];
}

export async function createThread(title = "New session"): Promise<ThreadRow> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from("eva_threads")
    .insert({ user_id: userId, title })
    .select("id,title,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ThreadRow;
}

export async function renameThread(threadId: string, title: string) {
  const { error } = await supabase
    .from("eva_threads")
    .update({ title })
    .eq("id", threadId);
  if (error) throw new Error(error.message);
}

export async function deleteThread(threadId: string) {
  const { error } = await supabase.from("eva_threads").delete().eq("id", threadId);
  if (error) throw new Error(error.message);
}

export async function listMessages(threadId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("eva_messages")
    .select("id,role,content,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
}

export async function saveMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from("eva_messages")
    .insert({ thread_id: threadId, user_id: userId, role, content });
  if (error) console.error("[eva] message persistence failed:", error.message);
}

export async function listAudit(limit = 60): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("eva_audit_log")
    .select("id,action,path,ok,detail,source,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}

export async function recordAudit(entry: {
  threadId?: string | null;
  action: string;
  path?: string | null;
  ok: boolean;
  detail?: string | null;
  source?: "agent" | "panel";
}): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase.from("eva_audit_log").insert({
    user_id: userId,
    thread_id: entry.threadId ?? null,
    action: entry.action,
    path: entry.path ?? null,
    ok: entry.ok,
    detail: entry.detail ?? null,
    source: entry.source ?? "agent",
  });
  if (error) console.error("[eva] audit persistence failed:", error.message);
}

/** Most recent messages from other sessions, oldest-first, for cross-session memory. */
export async function recentMemory(excludeThreadId: string, limit = 14) {
  const { data, error } = await supabase
    .from("eva_messages")
    .select("role,content,created_at,thread_id")
    .neq("thread_id", excludeThreadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? [])
    .slice()
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

export type VaProgress = {
  currentDay: number;
  status: "not_started" | "in_progress" | "completed";
  profile: Record<string, string>;
};

/** Reads VA progress, creating a fresh day-1 row on first ever session. */
export async function getVaProgress(): Promise<VaProgress> {
  const userId = await currentUserId();
  const empty: VaProgress = { currentDay: 1, status: "not_started", profile: {} };
  if (!userId) return empty;

  const { data, error } = await supabase
    .from("va_progress")
    .select("current_day,status,profile")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return empty;
  return {
    currentDay: data.current_day,
    status: data.status as VaProgress["status"],
    profile: (data.profile as Record<string, string>) ?? {},
  };
}

/** Upserts a partial VA progress patch (day, status, and/or profile fields). */
export async function upsertVaProgress(patch: {
  currentDay?: number;
  status?: VaProgress["status"];
  profile?: Record<string, string>;
}): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const existing = await getVaProgress();
  const mergedProfile = { ...existing.profile, ...(patch.profile ?? {}) };

  const { error } = await supabase.from("va_progress").upsert(
    {
      user_id: userId,
      current_day: patch.currentDay ?? existing.currentDay,
      status: patch.status ?? existing.status,
      profile: mergedProfile,
      last_session_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("[eva] VA progress persistence failed:", error.message);
}
