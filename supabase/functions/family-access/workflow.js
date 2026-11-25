// Kept separate so the failure and retry rules can be tested without email.
export async function approveRequest(api, request, actorId, resend = false) {
  if (request.status === "approved" && !resend) return { status: "approved" };
  if (request.status === "approved" && resend !== true) return { status: "conflict" };
  if (request.status === "processing" && !api.isStale(request.processing_at)) {
    return { status: "conflict" };
  }

  const claimed = await api.claim(request, actorId);
  if (!claimed) return { status: "conflict" };

  try {
    let userId = request.user_id || await api.findUser(request.email_normalized);
    if (!userId) {
      try {
        userId = await api.createUser(request.email_normalized);
      } catch (error) {
        // An earlier attempt or another admin may have created the Auth user.
        userId = await api.findUser(request.email_normalized);
        if (!userId) throw error;
      }
    }
    await api.ensureMember(request.family_id, userId, request.display_name);
    await api.sendLink(request.email_normalized);
    await api.finish(request.id, "approved", userId, actorId);
    return { status: "approved" };
  } catch (_) {
    // A successful Auth creation or membership insert is reused on retry.
    await api.finish(request.id, "retry_needed", null, actorId).catch(() => {});
    return { status: "retry_needed" };
  }
}
