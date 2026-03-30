import { afterEach, describe, expect, it } from "vitest";
import {
  ModelPolicyError,
  assertChatModelPolicyContract,
  getAllowedChatModels,
  getMaxConcurrentSessions,
  resolveChatModel,
} from "../modelPolicy.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("modelPolicy", () => {
  it("defaults to the approved q4 model lineup", () => {
    delete process.env.OLLAMA_ALLOWED_CHAT_MODELS;
    delete process.env.OLLAMA_MODEL;

    expect(getAllowedChatModels()).toEqual([
      "llama3:8b-q4_K_M",
      "mistral:7b-q4_0",
      "llama3:13b-q4_0",
    ]);
    expect(assertChatModelPolicyContract().defaultModel).toBe("llama3:8b-q4_K_M");
  });

  it("rejects defaults outside the approved model lineup", () => {
    process.env.OLLAMA_ALLOWED_CHAT_MODELS = "llama3:8b-q4_K_M,mistral:7b-q4_0";
    process.env.OLLAMA_MODEL = "llama3.2:3b";

    expect(() => assertChatModelPolicyContract()).toThrow(
      /Default chat model is not in the approved lineup/
    );
  });

  it("rejects requested chat models outside the approved lineup", () => {
    expect(() => resolveChatModel("llama3.2:3b")).toThrow(ModelPolicyError);
  });

  it("derives lower session capacity for the approved 13b model", () => {
    process.env.OLLAMA_MODEL = "llama3:13b-q4_0";

    expect(getMaxConcurrentSessions()).toBe(8);
  });
});
