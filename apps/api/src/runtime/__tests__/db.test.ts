import { describe, expect, it } from "vitest";
import { buildMongoConnectOptions } from "../../db.js";

describe("buildMongoConnectOptions", () => {
  it("returns an empty options object when no CA file is configured", () => {
    expect(buildMongoConnectOptions({} as NodeJS.ProcessEnv)).toEqual({});
  });

  it("enables TLS when a CA file is configured", () => {
    expect(buildMongoConnectOptions({
      MONGO_TLS_CA_FILE: "/tls/ca/ca.crt",
    } as NodeJS.ProcessEnv)).toEqual({
      tls: true,
      tlsCAFile: "/tls/ca/ca.crt",
    });
  });
});
