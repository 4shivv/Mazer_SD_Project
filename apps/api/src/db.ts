import mongoose from "mongoose";

export async function connectMongo() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("Missing MONGO_URL");

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("Connected to Mongo");
}
