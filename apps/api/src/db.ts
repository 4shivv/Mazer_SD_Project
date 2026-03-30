import mongoose, { type ConnectOptions } from "mongoose";

export function buildMongoConnectOptions(env: NodeJS.ProcessEnv = process.env): ConnectOptions {
  const caFile = env.MONGO_TLS_CA_FILE?.trim();
  if (!caFile) return {};

  return {
    tls: true,
    tlsCAFile: caFile,
  };
}

export async function connectMongo(env: NodeJS.ProcessEnv = process.env) {
  const uri = env.MONGO_URL;
  if (!uri) throw new Error("Missing MONGO_URL");

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, buildMongoConnectOptions(env));
  console.log("Connected to Mongo");
}
