const DESIGN_ALLOWED_CHAT_MODELS = [
  "llama3:8b-q4_K_M",
  "mistral:7b-q4_0",
  "llama3:13b-q4_0",
] as const;

const DESIGN_ALLOWED_CHAT_MODEL_SET = new Set<string>(DESIGN_ALLOWED_CHAT_MODELS);
const MODEL_SESSION_CAPACITY: Record<string, number> = {
  "llama3:8b-q4_K_M": 12,
  "mistral:7b-q4_0": 12,
  "llama3:13b-q4_0": 8,
};

export class ModelPolicyError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "invalid_chat_model") {
    super(message);
    this.name = "ModelPolicyError";
    this.status = status;
    this.code = code;
  }
}

function parseConfiguredModels(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isStrictQ4Model(model: string) {
  return /-q4(?:_|$)/i.test(model);
}

function resolveAllowedModelLineup(env: NodeJS.ProcessEnv = process.env) {
  const configured = parseConfiguredModels(env.OLLAMA_ALLOWED_CHAT_MODELS);
  const allowedModels = configured.length > 0
    ? configured
    : [...DESIGN_ALLOWED_CHAT_MODELS];

  for (const model of allowedModels) {
    if (!DESIGN_ALLOWED_CHAT_MODEL_SET.has(model)) {
      throw new Error(`Model policy configuration is outside the approved lineup: ${model}`);
    }
    if (!isStrictQ4Model(model)) {
      throw new Error(`Model policy configuration must use strict q4 models: ${model}`);
    }
  }

  return allowedModels;
}

export function getAllowedChatModels(env: NodeJS.ProcessEnv = process.env) {
  return resolveAllowedModelLineup(env);
}

export function getDefaultChatModel(env: NodeJS.ProcessEnv = process.env) {
  const allowedModels = resolveAllowedModelLineup(env);
  const configuredDefault = env.OLLAMA_MODEL?.trim();
  const defaultModel = configuredDefault && configuredDefault.length > 0
    ? configuredDefault
    : allowedModels[0];

  if (!defaultModel) {
    throw new Error("Model policy configuration does not define a default chat model");
  }
  if (!allowedModels.includes(defaultModel)) {
    throw new Error(`Default chat model is not in the approved lineup: ${defaultModel}`);
  }
  if (!isStrictQ4Model(defaultModel)) {
    throw new Error(`Default chat model must be a strict q4 model: ${defaultModel}`);
  }

  return defaultModel;
}

export function resolveChatModel(requestedModel?: string, env: NodeJS.ProcessEnv = process.env) {
  const allowedModels = resolveAllowedModelLineup(env);
  const model = requestedModel?.trim() ? requestedModel.trim() : getDefaultChatModel(env);

  if (!allowedModels.includes(model)) {
    throw new ModelPolicyError(
      `Model '${model}' is not in the approved lineup. Allowed models: ${allowedModels.join(", ")}`
    );
  }

  return model;
}

export function getMaxConcurrentSessions(env: NodeJS.ProcessEnv = process.env) {
  const model = getDefaultChatModel(env);
  return MODEL_SESSION_CAPACITY[model] ?? 12;
}

export function assertChatModelPolicyContract(env: NodeJS.ProcessEnv = process.env) {
  const allowedModels = resolveAllowedModelLineup(env);
  const defaultModel = getDefaultChatModel(env);

  return {
    allowedModels,
    defaultModel,
    maxConcurrentSessions: getMaxConcurrentSessions(env),
  };
}
