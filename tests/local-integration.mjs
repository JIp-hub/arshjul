// Run only against the isolated local Supabase stack. All identities are synthetic.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const modules = process.env.ARSHJUL_TEST_MODULES || resolve(import.meta.dirname, "../node_modules");
const { createClient } = require(resolve(modules, "@supabase/supabase-js"));
const { Client } = require(resolve(modules, "pg"));
const cli = process.env.ARSHJUL_SUPABASE_CLI || "supabase";
const status = JSON.parse(execFileSync(cli, ["stack", "status", "--output-format", "json"], {
  encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "ignore"]
}));
assert.equal(status.runtime, "native");
assert.match(status.identity?.name || "", /arshjul-family-test/);
const { API_URL: url, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey,
  MAILPIT_URL: mailpitUrl, DB_URL: dbUrl } = status.env;
assert.match(url, /^http:\/\/127\.0\.0\.1:/);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const publicClient = createClient(url, anonKey, options);
const anonymous = createClient(url, anonKey, options);
const db = new Client({ connectionString: dbUrl });
await db.connect();
const suffix = Date.now().toString(36);
const adminEmail = `admin-${suffix}@example.invalid`;
const memberEmail = `member-${suffix}@example.invalid`;
const rejectEmail = `reject-${suffix}@example.invalid`;
const strangerEmail = `stranger-${suffix}@example.invalid`;
const password = `LocalOnly-${crypto.randomUUID()}!`;
const invite = `family_test_${crypto.randomUUID().replaceAll("-", "")}`;

function check(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.status || "error"}`);
  return result.data;
}
function clientFor(token) {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } } });
}
async function action(body, token = "") {
  const reply = await fetch(`${url}/functions/v1/family-access`, { method: "POST", headers: {
    "content-type": "application/json", apikey: anonKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }, body: JSON.stringify(body) });
  const result = await reply.json();
  return { status: reply.status, result };
}
async function messages() {
  const reply = await fetch(`${mailpitUrl}/api/v1/messages`);
  assert.equal(reply.status, 200);
  return (await reply.json()).messages;
}

// A closed signup gate and fully separate Auth identities.
const signup = await publicClient.auth.signUp({ email: strangerEmail, password });
assert.ok(signup.error || !signup.data.user, "public registration must remain closed");
const adminUser = check(await service.auth.admin.createUser({ email: adminEmail, password,
  email_confirm: true }), "create synthetic admin").user;
const family = (await db.query("insert into public.families(name,invite_code) values($1,$2) returning id",
  ["Synthetic Family", invite])).rows[0];
await db.query("insert into public.family_members(family_id,user_id,display_name,role) values($1,$2,$3,$4)",
  [family.id, adminUser.id, "Test Admin", "admin"]);
const adminSession = check(await publicClient.auth.signInWithPassword({ email: adminEmail, password }),
  "admin sign in").session;
assert.ok(adminSession?.access_token);
const admin = clientFor(adminSession.access_token);
console.log("PASS closed signup and synthetic admin");

// Public application and read isolation.
assert.deepEqual(await action({ action: "apply", code: invite, name: "Test Member", email: memberEmail }),
  { status: 202, result: { ok: true } });
assert.deepEqual(await action({ action: "apply", code: invite, name: "Test Member", email: memberEmail }),
  { status: 202, result: { ok: true } });
assert.deepEqual(await action({ action: "apply", code: "not_a_real_family_code_123", name: "Test Member",
  email: strangerEmail }), { status: 202, result: { ok: true } });
const queue = check(await admin.from("family_access_requests").select("id,email_normalized,status"),
  "admin queue");
assert.equal(queue.length, 1, "duplicate or invalid code must not create requests");
assert.equal(queue[0].status, "pending");
const anonQueue = await anonymous.from("family_access_requests").select("id");
assert.ok(anonQueue.error || anonQueue.data.length === 0);
assert.equal((await action({ action: "approve", id: queue[0].id })).status, 404);
assert.equal((await action({ action: "reject", id: queue[0].id })).status, 404);
console.log("PASS application, deduplication, unreadable queue and admin gate");

// Approval prepares a member but RLS does not disclose family data until email-code sign-in.
const memberRequest = queue[0].id;
const approval = await action({ action: "approve", id: memberRequest }, adminSession.access_token);
assert.deepEqual(approval, { status: 200, result: { status: "approved" } });
const memberRecord = check(await admin.from("family_access_requests")
  .select("status,user_id").eq("id", memberRequest).single(), "approved request");
assert.ok(memberRecord.user_id);
const memberRows = check(await admin.from("family_members").select("user_id,role")
  .eq("family_id", family.id).eq("user_id", memberRecord.user_id), "member record");
assert.equal(memberRows.length, 1);
assert.equal(memberRows[0].role, "member");
const identity = check(await service.auth.admin.getUserById(memberRecord.user_id), "member identity").user;
assert.ok(identity.email_confirmed_at);
assert.equal(identity.last_sign_in_at, undefined);
const birthday = (await db.query("insert into public.birthdays(family_id,name,birth_month,birth_day) values($1,$2,$3,$4) returning id",
  [family.id, "Synthetic Birthday", 2, 3])).rows[0];
assert.equal(check(await admin.from("birthdays").select("id").eq("id", birthday.id), "admin birthdate read").length, 1);
const anonBirthdays = await anonymous.from("birthdays").select("id");
assert.ok(anonBirthdays.error || anonBirthdays.data.length === 0);
assert.equal(check(await admin.from("family_access_requests").select("id"), "admin queue read").length, 1);
console.log("PASS approval, pre-login member isolation and family RLS");

// The code in Mailpit signs the installed app into its own session store.
const captured = await messages();
const inviteMail = captured.find((message) => JSON.stringify(message.To || []).includes(memberEmail));
assert.ok(inviteMail, "approval email must reach local Mailpit");
const detailReply = await fetch(`${mailpitUrl}/api/v1/message/${inviteMail.ID}`);
assert.equal(detailReply.status, 200);
const detail = await detailReply.json();
const html = detail.HTML || detail.Text || "";
const tokenMatch = html.match(/(?:engångskod|kod)[^0-9]{0,150}(\d{6,8})/i) || html.match(/\b(\d{6,8})\b/);
assert.ok(tokenMatch, "mail template must contain a numeric code");
const token = tokenMatch[1];
const installedStore = new Map();
const storage = { getItem: (key) => installedStore.get(key) ?? null,
  setItem: (key, value) => installedStore.set(key, value),
  removeItem: (key) => installedStore.delete(key) };
const installed = createClient(url, anonKey, { auth: { storage, persistSession: true, autoRefreshToken: false } });
const signedIn = check(await installed.auth.verifyOtp({ email: memberEmail, token, type: "email" }),
  "installed app OTP verification");
assert.ok(signedIn.session?.access_token);
assert.ok(installedStore.size > 0, "installed app must store its own session");
const reloaded = createClient(url, anonKey, { auth: { storage, persistSession: true, autoRefreshToken: false } });
const restored = check(await reloaded.auth.getSession(), "installed app session restore").session;
assert.equal(restored?.user?.id, memberRecord.user_id);
assert.equal(check(await clientFor(restored.access_token).from("birthdays")
  .select("id").eq("id", birthday.id), "verified member read").length, 1);
assert.equal(check(await anonymous.auth.getSession(), "separate browser context").session, null);
console.log("PASS Mailpit code, isolated installed session, relaunch and verified family access");

// A normal member may not see or decide applications; approval is idempotent.
const member = clientFor(restored.access_token);
const memberQueue = await member.from("family_access_requests").select("id");
assert.ok(memberQueue.error || memberQueue.data.length === 0);
assert.equal((await action({ action: "approve", id: memberRequest }, restored.access_token)).status, 404);
assert.deepEqual(await action({ action: "approve", id: memberRequest }, adminSession.access_token),
  { status: 200, result: { status: "approved" } });
assert.equal((await messages()).length, captured.length, "idempotent approval must not send twice");
assert.deepEqual(await action({ action: "apply", code: invite, name: "Reject Me", email: rejectEmail }),
  { status: 202, result: { ok: true } });
const rejection = check(await admin.from("family_access_requests").select("id")
  .eq("email_normalized", rejectEmail).single(), "rejection request");
assert.deepEqual(await action({ action: "reject", id: rejection.id }, adminSession.access_token),
  { status: 200, result: { status: "rejected" } });
assert.equal(check(await admin.from("family_access_requests").select("status")
  .eq("id", rejection.id).single(), "rejection state").status, "rejected");
console.log("PASS member isolation, idempotent approval and rejection");
await db.end();
