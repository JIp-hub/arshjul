import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { approveRequest } from "./workflow.js";

const site = "https://jip-hub.github.io/arshjul/";
const allowedOrigins = new Set(["https://jip-hub.github.io", "http://127.0.0.1:8765"]);
const url = Deno.env.get("SUPABASE_URL") || "";
const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const mail = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

function response(body: object, status = 200, origin = "") {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  if (allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Vary", "Origin");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function ipHash(req: Request): Promise<string> {
  // Hash before storage; the family-wide cap also applies if an IP header is spoofed.
  const ip = req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const bytes = new TextEncoder().encode(`${adminKey}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(req: Request, familyId: string): Promise<boolean> {
  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return false;
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError || !identity.user?.id || !identity.user.email_confirmed_at) return false;
  const { data, error } = await admin.from("family_members")
    .select("user_id").eq("family_id", familyId).eq("user_id", identity.user.id).eq("role", "admin").maybeSingle();
  return !error && Boolean(data);
}

function workflowApi() {
  return {
    isStale: (value: string | null) => !value || Date.now() - Date.parse(value) > 120000,
    async claim(request: Record<string, string | null>, actorId: string) {
      let query = admin.from("family_access_requests")
        .update({ status: "processing", processing_at: new Date().toISOString(), decided_by: actorId })
        .eq("id", request.id).eq("status", request.status);
      if (request.status === "processing" && request.processing_at) {
        query = query.eq("processing_at", request.processing_at);
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async findUser(email: string) {
      const { data, error } = await admin.rpc("find_access_auth_user", { p_email: email });
      if (error) throw error;
      return data as string | null;
    },
    async createUser(email: string) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: false });
      if (error || !data.user?.id) throw error || new Error("Auth user missing");
      return data.user.id;
    },
    async ensureMember(familyId: string, userId: string, name: string) {
      const { error } = await admin.from("family_members")
        .upsert({ family_id: familyId, user_id: userId, display_name: name, role: "member" },
          { onConflict: "family_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    async sendLink(email: string) {
      const { error } = await mail.auth.signInWithOtp({
        email, options: { shouldCreateUser: false, emailRedirectTo: site }
      });
      if (error) throw error;
    },
    async finish(id: string, status: string, userId: string | null, actorId: string) {
      const update: Record<string, string | null> = {
        status, processing_at: null, decided_at: new Date().toISOString(), decided_by: actorId
      };
      if (userId) update.user_id = userId;
      const { data, error } = await admin.from("family_access_requests")
        .update(update).eq("id", id).eq("status", "processing").select("id").maybeSingle();
      if (error || !data) throw error || new Error("Approval state changed");
    }
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return response({ error: "Otillåten begäran" }, 403);
  if (req.method === "OPTIONS") return response({}, 204, origin);
  if (req.method !== "POST") return response({ error: "Metoden stöds inte" }, 405, origin);
  if (Number(req.headers.get("content-length") || 0) > 4096) return response({ error: "För stor begäran" }, 413, origin);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ error: "Ogiltig begäran" }, 400, origin); }
  if (!body || typeof body !== "object") return response({ error: "Ogiltig begäran" }, 400, origin);

  if (body.action === "apply") {
    if (typeof body.website === "string" && body.website.trim()) {
      return response({ ok: true }, 202, origin);
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!name || name.length > 120 || !validEmail(email) ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(code)) {
      return response({ error: "Kontrollera namn och e-postadress" }, 400, origin);
    }
    try {
      const { error } = await admin.rpc("submit_family_access_request", {
        p_code: code, p_name: name, p_email: email, p_ip_hash: await ipHash(req)
      });
      if (error) throw error;
      // The same answer for a missing code, duplicate, or throttled request.
      return response({ ok: true }, 202, origin);
    } catch {
      return response({ error: "Ansökan kunde inte skickas just nu" }, 503, origin);
    }
  }

  if (!["approve", "resend", "reject"].includes(String(body.action))) {
    return response({ error: "Ogiltig begäran" }, 400, origin);
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) {
    return response({ error: "Ogiltig ansökan" }, 400, origin);
  }
  const { data: application, error: readError } = await admin.from("family_access_requests")
    .select("id,family_id,display_name,email_normalized,status,user_id,processing_at")
    .eq("id", id).maybeSingle();
  if (readError || !application) return response({ error: "Ansökan saknas" }, 404, origin);
  if (!await requireAdmin(req, application.family_id)) return response({ error: "Ansökan saknas" }, 404, origin);

  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "")?.[1] || "";
  const { data: identity } = await admin.auth.getUser(token);
  const actorId = identity.user?.id || "";

  if (body.action === "reject") {
    if (!["pending", "retry_needed", "rejected"].includes(application.status)) {
      return response({ error: "Ansökan behandlas redan" }, 409, origin);
    }
    if (application.status === "rejected") return response({ status: "rejected" }, 200, origin);
    const { data, error } = await admin.from("family_access_requests")
      .update({ status: "rejected", decided_by: actorId, decided_at: new Date().toISOString() })
      .eq("id", id).eq("status", application.status).select("id").maybeSingle();
    if (error) return response({ error: "Försök igen" }, 503, origin);
    return response({ status: data ? "rejected" : "conflict" }, data ? 200 : 409, origin);
  }

  try {
    const result = await approveRequest(workflowApi(), application, actorId, body.action === "resend");
    return response(result, result.status === "conflict" ? 409 : result.status === "retry_needed" ? 503 : 200, origin);
  } catch {
    return response({ error: "Försök igen" }, 503, origin);
  }
});
