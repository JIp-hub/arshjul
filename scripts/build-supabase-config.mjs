import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = process.env.ARSHJUL_CONFIG_OUTPUT
  ? path.resolve(process.env.ARSHJUL_CONFIG_OUTPUT)
  : path.join(projectRoot, "supabase-config.js");

const config = {
  supabaseUrl: String(process.env.ARSHJUL_SUPABASE_URL || "").trim(),
  supabasePublishableKey: String(process.env.ARSHJUL_SUPABASE_PUBLISHABLE_KEY || "").trim(),
  authRedirectUrl: String(process.env.ARSHJUL_AUTH_REDIRECT_URL || "").trim()
};

function jwtRole(key) {
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return "";
    return String(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role || "");
  } catch {
    return "";
  }
}

if (!/^https?:\/\//.test(config.supabaseUrl)) {
  throw new Error("ARSHJUL_SUPABASE_URL måste vara en http- eller https-URL.");
}
if (!config.supabasePublishableKey) {
  throw new Error("ARSHJUL_SUPABASE_PUBLISHABLE_KEY saknas.");
}
if (/^(sb_secret_|service_role)/i.test(config.supabasePublishableKey) || jwtRole(config.supabasePublishableKey) === "service_role") {
  throw new Error("En service role/secret key får aldrig byggas in i webbappen.");
}
if (!/^https?:\/\//.test(config.authRedirectUrl)) {
  throw new Error("ARSHJUL_AUTH_REDIRECT_URL måste vara en http- eller https-URL.");
}

const source = `// Generated from deployment variables. Contains public browser configuration only.\nwindow.ARSHJUL_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
await writeFile(outputPath, source, { mode: 0o600 });
console.log(`Skrev offentlig Supabase-konfiguration till ${outputPath}`);
