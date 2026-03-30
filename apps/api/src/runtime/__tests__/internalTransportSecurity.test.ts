import { describe, expect, it } from "vitest";
import {
  assertInternalTransportSecurityContract,
  getInternalTransportSecurityStatus,
} from "../internalTransportSecurity.js";

describe("internal transport security contract", () => {
  it("defaults to explicit variance in production when TLS is not configured", () => {
    const status = getInternalTransportSecurityStatus({
      NODE_ENV: "production",
      MONGO_URL: "mongodb://mongo:27017/mazerai",
      CHROMA_HOST: "http://chroma:8000",
      OLLAMA_HOST: "http://ollama:11434",
    });

    expect(status.mode).toBe("disabled-explicit");
    expect(status.compliant).toBe(false);
    expect(status.enforcement).toBe("variance");
  });

  it("accepts required mode only when all internal endpoints are secure", () => {
    const status = assertInternalTransportSecurityContract({
      NODE_ENV: "production",
      INTERNAL_TLS_MODE: "required",
      MONGO_URL: "mongodb://mongo:27017/mazerai?tls=true",
      CHROMA_HOST: "https://chroma.internal:8443",
      OLLAMA_HOST: "https://ollama.internal:11443",
    });

    expect(status.compliant).toBe(true);
    expect(status.enforcement).toBe("required");
  });

  it("fails closed when required mode is configured without secure endpoints", () => {
    expect(() =>
      assertInternalTransportSecurityContract({
        NODE_ENV: "production",
        INTERNAL_TLS_MODE: "required",
        MONGO_URL: "mongodb://mongo:27017/mazerai",
        CHROMA_HOST: "http://chroma:8000",
        OLLAMA_HOST: "http://ollama:11434",
      })
    ).toThrow(/Internal transport security contract failed/);
  });
});
