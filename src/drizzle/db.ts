import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema";

declare global {
  var _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

const client = new SQL(process.env.DATABASE_URL!);
const db = globalThis._db || drizzle({ client, schema });

if (process.env.NODE_ENV !== "production") {
  globalThis._db = db;
}

export { db };
