(function (global) {
  "use strict";

  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";

  function hasValidDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }

  function normalizeEvent(event) {
    if (!event || typeof event !== "object") return null;
    const title = String(event.title || "").trim();
    const date = String(event.date || "").trim();
    if (!title || !hasValidDate(date)) return null;
    return {
      title,
      date,
      time: String(event.time || "").trim(),
      place: String(event.place || "").trim(),
      desc: String(event.desc || "").trim(),
      icon: String(event.icon || "🗓️").trim() === "🎉" ? "🎉" : "🗓️"
    };
  }

  function normalizeBirthday(entry) {
    if (!entry || typeof entry !== "object") return null;
    const name = String(entry.name || "").trim();
    const month = Number(entry.month);
    const day = Number(entry.day);
    const year = entry.year === null || String(entry.year ?? "").trim() === "" ? null : Number(entry.year);
    if (!name || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9999)) return null;
    const validationYear = year ?? 2000;
    const date = `${String(validationYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!hasValidDate(date)) return null;
    return { name, year, month, day };
  }

  function normalizedText(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function eventSignature(event) {
    return [
      String(event.date || ""),
      normalizedText(event.title),
      normalizedText(event.time),
      normalizedText(event.place),
      normalizedText(event.desc),
      String(event.icon || "🗓️")
    ].join("|");
  }

  function birthdaySignature(entry) {
    return [normalizedText(entry.name), entry.month, entry.day, entry.year ?? ""].join("|");
  }

  function readJwtRole(key) {
    try {
      const parts = String(key || "").split(".");
      if (parts.length !== 3) return "";
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      return String(JSON.parse(global.atob(padded)).role || "");
    } catch {
      return "";
    }
  }

  function validateConfig(config) {
    const url = String(config?.supabaseUrl || "").trim();
    const key = String(config?.supabasePublishableKey || "").trim();
    if (!url && !key) return { configured: false };
    if (!/^https?:\/\//.test(url)) throw new Error("Supabase URL måste börja med http:// eller https://.");
    if (!key) throw new Error("Supabase publishable key saknas.");
    if (/^(sb_secret_|service_role)/i.test(key) || readJwtRole(key) === "service_role") {
      throw new Error("En privat service role/secret key får inte användas i webbläsaren.");
    }
    return { configured: true, url, key };
  }

  class SupabaseAdapter {
    constructor(client, config, onError) {
      this.client = client;
      this.config = config;
      this.onError = typeof onError === "function" ? onError : function () {};
      this.session = null;
      this.user = null;
      this.membership = null;
      this.events = [];
      this.birthdays = [];
      this.memberNames = new Map();
      this.authSubscription = null;
      this.lastMutationRefreshFailed = false;

      this.eventStore = {
        listEvents: () => this.events.slice(),
        exportEvents: () => this.events.slice(),
        replaceEvents: (events) => this.importEvents(events),
        createEvent: (event) => this.createEvent(event),
        updateEvent: (event) => this.updateEvent(event),
        deleteEventById: (id) => this.deleteEventById(id),
        importEvents: (events) => this.importEvents(events)
      };

      this.birthdayStore = {
        listBirthdays: () => this.birthdays.slice(),
        exportBirthdays: () => this.birthdays.slice(),
        importBirthdays: (entries) => this.importBirthdays(entries)
      };
    }

    fail(action, error) {
      this.onError(action, error);
    }

    clearData() {
      this.membership = null;
      this.events = [];
      this.birthdays = [];
      this.memberNames = new Map();
    }

    async getSession() {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.session = data?.session || null;
      this.user = this.session?.user || null;
      return this.session;
    }

    onAuthChange(callback) {
      const result = this.client.auth.onAuthStateChange((_event, session) => callback(session || null));
      this.authSubscription = result?.data?.subscription || null;
      return this.authSubscription;
    }

    async sendMagicLink(email) {
      const normalizedEmail = String(email || "").trim();
      if (!normalizedEmail) return false;
      const redirectTo = String(this.config.authRedirectUrl || "").trim() || `${global.location.origin}${global.location.pathname}`;
      const { error } = await this.client.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo
        }
      });
      if (error) {
        this.fail("skicka inloggningslänk", error);
        return false;
      }
      return true;
    }

    async signOut() {
      const { error } = await this.client.auth.signOut();
      if (error) {
        this.fail("logga ut", error);
        return false;
      }
      this.session = null;
      this.user = null;
      this.clearData();
      return true;
    }

    async useSession(session) {
      const previousUserId = this.user?.id || null;
      this.session = session || null;
      this.user = this.session?.user || null;
      if (!this.user) {
        this.clearData();
        return { authenticated: false, membership: null };
      }

      if (previousUserId && previousUserId !== this.user.id) this.clearData();

      const loaded = await this.loadFamilyData();
      if (!loaded) this.clearData();
      return {
        authenticated: true,
        membership: loaded ? this.membership : null,
        loadFailed: !loaded
      };
    }

    async loadFamilyData() {
      if (!this.user) {
        this.clearData();
        return true;
      }

      const membershipResult = await this.client
        .from("family_members")
        .select("family_id,user_id,display_name,role,created_at,families(name,invite_code)")
        .eq("user_id", this.user.id)
        .order("created_at", { ascending: true })
        .order("family_id", { ascending: true });

      if (membershipResult.error) {
        this.clearData();
        this.fail("hämta familjemedlemskap", membershipResult.error);
        return false;
      }

      const membershipRow = Array.isArray(membershipResult.data)
        ? membershipResult.data[0]
        : membershipResult.data;

      if (!membershipRow) {
        this.clearData();
        return true;
      }

      const membership = {
        familyId: membershipRow.family_id,
        userId: membershipRow.user_id,
        displayName: membershipRow.display_name,
        role: membershipRow.role,
        familyName: membershipRow.families?.name || "Familjen",
        inviteCode: membershipRow.families?.invite_code || null
      };

      const [membersResult, eventsResult, birthdaysResult] = await Promise.all([
        this.client
          .from("family_members")
          .select("user_id,display_name,role")
          .eq("family_id", membership.familyId),
        this.client
          .from("events")
          .select("id,family_id,created_by,title,event_date,event_time,place,description,icon,created_at,updated_at")
          .eq("family_id", membership.familyId)
          .order("event_date", { ascending: true }),
        this.client
          .from("birthdays")
          .select("id,family_id,name,birth_year,birth_month,birth_day,created_at,updated_at")
          .eq("family_id", membership.familyId)
          .order("birth_month", { ascending: true })
          .order("birth_day", { ascending: true })
      ]);

      const failed = [membersResult, eventsResult, birthdaysResult].find((result) => result.error);
      if (failed) {
        this.clearData();
        this.fail("hämta familjedata", failed.error);
        return false;
      }

      const names = new Map((membersResult.data || []).map((member) => [member.user_id, member.display_name]));
      const events = (eventsResult.data || []).map((row) => ({
        id: row.id,
        title: row.title,
        date: row.event_date,
        time: row.event_time ? String(row.event_time).slice(0, 5) : "",
        place: row.place || "",
        desc: row.description || "",
        icon: row.icon || "🗓️",
        createdById: row.created_by,
        createdBy: names.get(row.created_by) || "Familjemedlem"
      }));
      const birthdays = (birthdaysResult.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        year: row.birth_year,
        month: row.birth_month,
        day: row.birth_day
      }));

      this.membership = membership;
      this.memberNames = names;
      this.events = events;
      this.birthdays = birthdays;
      return true;
    }

    async refreshAfterMutation() {
      const refreshed = await this.loadFamilyData();
      this.lastMutationRefreshFailed = !refreshed;
      return refreshed;
    }

    requireMembership(action) {
      if (this.user && this.membership) return true;
      this.fail(action, new Error("Inloggat familjemedlemskap saknas."));
      return false;
    }

    canManageEvent(event) {
      return Boolean(
        this.user && this.membership &&
        (this.membership.role === "admin" || event?.createdById === this.user.id)
      );
    }

    canManageBirthdays() {
      return Boolean(this.membership?.role === "admin");
    }

    async createEvent(event) {
      this.lastMutationRefreshFailed = false;
      if (!this.requireMembership("skapa händelse")) return false;
      const normalized = normalizeEvent(event);
      if (!normalized) return false;

      const { error } = await this.client.from("events").insert({
        family_id: this.membership.familyId,
        created_by: this.user.id,
        title: normalized.title,
        event_date: normalized.date,
        event_time: normalized.time || null,
        place: normalized.place || null,
        description: normalized.desc || null,
        icon: normalized.icon
      });
      if (error) {
        this.fail("skapa händelse", error);
        return false;
      }
      await this.refreshAfterMutation();
      return true;
    }

    async updateEvent(event) {
      this.lastMutationRefreshFailed = false;
      const existing = this.events.find((candidate) => candidate.id === event?.id);
      if (!existing || !this.canManageEvent(existing)) {
        this.fail("uppdatera händelse", new Error("Behörighet saknas."));
        return false;
      }
      const normalized = normalizeEvent(event);
      if (!normalized) return false;

      const result = await this.client
        .from("events")
        .update({
          title: normalized.title,
          event_date: normalized.date,
          event_time: normalized.time || null,
          place: normalized.place || null,
          description: normalized.desc || null,
          icon: normalized.icon
        })
        .eq("id", existing.id)
        .select("id")
        .maybeSingle();
      if (result.error || !result.data) {
        this.fail("uppdatera händelse", result.error || new Error("Händelsen hittades inte eller nekades av RLS."));
        return false;
      }
      await this.refreshAfterMutation();
      return true;
    }

    async deleteEventById(id) {
      this.lastMutationRefreshFailed = false;
      const existing = this.events.find((candidate) => candidate.id === id);
      if (!existing || !this.canManageEvent(existing)) {
        this.fail("ta bort händelse", new Error("Behörighet saknas."));
        return false;
      }
      const result = await this.client.from("events").delete().eq("id", id).select("id").maybeSingle();
      if (result.error || !result.data) {
        this.fail("ta bort händelse", result.error || new Error("Händelsen hittades inte eller nekades av RLS."));
        return false;
      }
      await this.refreshAfterMutation();
      return true;
    }

    async importEvents(entries) {
      this.lastMutationRefreshFailed = false;
      if (!this.requireMembership("importera händelser")) return null;
      if (!Array.isArray(entries) || entries.length === 0) return [];
      const normalized = entries.map(normalizeEvent);
      if (normalized.some((entry) => entry === null)) return [];

      const existing = new Set(this.events.map(eventSignature));
      const unique = normalized.filter((entry) => {
        const signature = eventSignature(entry);
        if (existing.has(signature)) return false;
        existing.add(signature);
        return true;
      });
      if (unique.length === 0) return [];

      const rows = unique.map((entry) => ({
        family_id: this.membership.familyId,
        created_by: this.user.id,
        title: entry.title,
        event_date: entry.date,
        event_time: entry.time || null,
        place: entry.place || null,
        description: entry.desc || null,
        icon: entry.icon
      }));
      const { error } = await this.client.from("events").insert(rows);
      if (error) {
        this.fail("importera händelser", error);
        return null;
      }
      await this.refreshAfterMutation();
      return unique;
    }

    async importBirthdays(entries) {
      this.lastMutationRefreshFailed = false;
      if (!this.canManageBirthdays()) {
        this.fail("importera födelsedagar", new Error("Adminbehörighet krävs."));
        return null;
      }
      if (!Array.isArray(entries) || entries.length === 0) return null;
      const normalized = entries.map(normalizeBirthday);
      if (normalized.some((entry) => entry === null)) return null;

      const existing = new Set(this.birthdays.map(birthdaySignature));
      const unique = normalized.filter((entry) => {
        const signature = birthdaySignature(entry);
        if (existing.has(signature)) return false;
        existing.add(signature);
        return true;
      });
      if (unique.length === 0) return [];

      const rows = unique.map((entry) => ({
        family_id: this.membership.familyId,
        name: entry.name,
        birth_year: entry.year,
        birth_month: entry.month,
        birth_day: entry.day
      }));
      const { error } = await this.client.from("birthdays").insert(rows);
      if (error) {
        this.fail("importera födelsedagar", error);
        return null;
      }
      await this.refreshAfterMutation();
      return unique;
    }
  }

  async function loadClientFactory() {
    if (global.supabase && typeof global.supabase.createClient === "function") {
      return global.supabase.createClient;
    }
    const module = await import(SDK_URL);
    return module.createClient;
  }

  async function create(config, options = {}) {
    const validated = validateConfig(config);
    if (!validated.configured) return null;
    const createClient = options.createClient || await loadClientFactory();
    const client = createClient(validated.url, validated.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return new SupabaseAdapter(client, config, options.onError);
  }

  global.ArshjulSupabase = Object.freeze({
    sdkUrl: SDK_URL,
    validateConfig,
    create,
    normalizeEvent,
    normalizeBirthday
  });
})(window);
