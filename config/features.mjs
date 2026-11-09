function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean environment value: ${value}`);
}

const environment = process.env.NODE_ENV || "development";
if (!["development", "production", "test"].includes(environment)) {
  throw new Error("NODE_ENV must be development, test, or production.");
}
const productionDefault = process.env.NODE_ENV === "production";
export const demoMode = parseBoolean(process.env.AGROSEED_DEMO_MODE, !productionDefault);
export const allowSandboxOrders = parseBoolean(process.env.AGROSEED_ALLOW_SANDBOX_ORDERS, true);

// Demo mode is the single switch for local sample-catalog and sandbox APIs.
// Turning it off disables those APIs in the deployed production configuration.
export const runtimeConfig = Object.freeze({
  mode: demoMode ? "sandbox" : "production",
  demoMode
});
