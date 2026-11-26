import test from "node:test";
import assert from "node:assert/strict";
import { approveRequest } from "../supabase/functions/family-access/workflow.js";

function fixture(failAt = "") {
  const request = {
    id: "00000000-0000-0000-0000-000000000101",
    family_id: "00000000-0000-0000-0000-000000000102",
    display_name: "Test Person",
    email_normalized: "person@example.invalid",
    status: "pending", user_id: null, processing_at: null
  };
  const calls = { create: 0, member: 0, mail: 0, finish: [] };
  let userId = null;
  let claimed = false;
  const api = {
    isStale: () => true,
    claim: async () => { if (claimed) return false; claimed = true; return true; },
    findUser: async () => userId,
    createUser: async () => {
      calls.create++;
      if (failAt === "create") throw new Error("temporary Auth failure");
      userId = "00000000-0000-0000-0000-000000000103";
      return userId;
    },
    ensureMember: async () => {
      calls.member++;
      if (failAt === "member") throw new Error("temporary database failure");
    },
    sendLink: async () => {
      calls.mail++;
      if (failAt === "mail") throw new Error("temporary SMTP failure");
    },
    finish: async (_id, status) => { calls.finish.push(status); claimed = false; }
  };
  return { request, calls, api, setFailure: (value) => { failAt = value; } };
}

test("approval creates one account, membership, and email", async () => {
  const { request, calls, api } = fixture();
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "approved" });
  assert.deepEqual(calls, { create: 1, member: 1, mail: 1, finish: ["approved"] });
});

test("mail failure can be retried without creating a second Auth user", async () => {
  const { request, calls, api, setFailure } = fixture("mail");
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "retry_needed" });
  assert.deepEqual(calls.finish, ["retry_needed"]);
  request.status = "retry_needed";
  setFailure("");
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "approved" });
  assert.equal(calls.create, 1);
  assert.equal(calls.mail, 2);
});

test("an active approval cannot be claimed twice", async () => {
  const { request, calls, api } = fixture();
  request.status = "processing";
  api.isStale = () => false;
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "conflict" });
  assert.equal(calls.create, 0);
  assert.equal(calls.mail, 0);
});

test("already approved request does not send another email", async () => {
  const { request, calls, api } = fixture();
  request.status = "approved";
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "approved" });
  assert.equal(calls.mail, 0);
});

test("stale processing is recovered by the next admin attempt", async () => {
  const { request, calls, api } = fixture();
  request.status = "processing";
  request.processing_at = "2020-01-01T00:00:00Z";
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "approved" });
  assert.equal(calls.mail, 1);
});

test("temporary Auth creation failure leaves an explicit retry state", async () => {
  const { request, calls, api } = fixture("create");
  assert.deepEqual(await approveRequest(api, request, "admin"), { status: "retry_needed" });
  assert.deepEqual(calls.finish, ["retry_needed"]);
  assert.equal(calls.member, 0);
  assert.equal(calls.mail, 0);
});
