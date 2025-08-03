import { user } from "./schema";
import { createSelectSchema,createInsertSchema } from 'drizzle-zod';


export const userSelectSchema = createSelectSchema(user);
export const userInsertSchema = createInsertSchema(user);