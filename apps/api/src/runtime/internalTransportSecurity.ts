type InternalTlsMode = "development" | "disabled-explicit" | "required";

export type InternalTransportSecurityStatus = {
  mode: InternalTlsMode;
  compliant: boolean;
  enforcement: "none" | "variance" | "required";
  reason: string;
  endpoints: {
    mongo: string;
    chroma: string;
    ollama: string;
  };
};

function resolveInternalTlsMode(env: NodeJS.ProcessEnv): InternalTlsMode {
  const raw = env.INTERNAL_TLS_MODE?.trim().toLowerCase();
  if (raw === "required" || raw === "disabled-explicit" || raw === "development") {
    return raw;
  }
  return env.NODE_ENV === "production" ? "disabled-explicit" : "development";
}

function isSecureHttpEndpoint(url: string) {
  return url.startsWith("https://");
}

function isSecureMongoUrl(url: string) {
  if (url.startsWith("mongodb+srv://")) return true;
  const normalized = url.toLowerCase();
  return normalized.includes("tls=true") || normalized.includes("ssl=true");
}

export function getInternalTransportSecurityStatus(
  env: NodeJS.ProcessEnv = process.env
): InternalTransportSecurityStatus {
  const mongo = env.MONGO_URL || "";
  const chroma = env.CHROMA_HOST || "http://localhost:8000";
  const ollama = env.OLLAMA_HOST || "http://localhost:11434";
  const mode = resolveInternalTlsMode(env);

  const endpoints = { mongo, chroma, ollama };
  const allSecure =
    isSecureMongoUrl(mongo) &&
    isSecureHttpEndpoint(chroma) &&
    isSecureHttpEndpoint(ollama);

  if (mode === "development") {
    return {
      mode,
      compliant: allSecure,
      enforcement: "none",
      reason: "development_mode_allows_non_tls_internal_endpoints",
      endpoints,
    };
  }

  if (mode === "disabled-explicit") {
    return {
      mode,
      compliant: false,
      enforcement: "variance",
      reason: "internal_tls_not_enabled_explicit_variance_recorded",
      endpoints,
    };
  }

  return {
    mode,
    compliant: allSecure,
    enforcement: "required",
    reason: allSecure
      ? "internal_tls_requirements_satisfied"
      : "internal_tls_required_but_secure_endpoints_not_configured",
    endpoints,
  };
}

export function assertInternalTransportSecurityContract(
  env: NodeJS.ProcessEnv = process.env
) {
  const status = getInternalTransportSecurityStatus(env);
  if (status.enforcement === "required" && !status.compliant) {
    throw new Error(
      `Internal transport security contract failed: ${status.reason}`
    );
  }
  return status;
}
