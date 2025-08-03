"use server";

import { db } from "@/drizzle/db";
import { tryCatch } from "@/lib/try-catch";
import { user } from "@/drizzle/schema";
import { eq, count } from "drizzle-orm";
import z from "zod";
import { userInsertSchema } from "@/drizzle/model";

/**
 * Retrieves all users from the database.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of user objects.
 * @throws {Error} If there is an error retrieving the users.
 */
export async function userGetAll() {
  const { data, error } = await tryCatch(db.query.user.findMany());
  if (error || !data) {
    console.error(error ? error.message : "Error Getting users");
    throw new Error("Error Getting users");
  }
  return data;
}

/**
 * Retrieves a single user from the database by their ID.
 * @param {string} id - The ID of the user to retrieve.
 * @returns {Promise<object>} A promise that resolves to the user object.
 * @throws {Error} If there is an error retrieving the user.
 */
export async function userGetOneById(id: string) {
  const { data, error } = await tryCatch(
    db.query.user.findFirst({
      where: eq(user.id, id),
    })
  );
  if (error || !data) {
    console.error(error ? error.message : "Error Getting user");
    throw new Error("Error Getting user");
  }
  return data;
}

/**
 * Retrieves a single user from the database by their email.
 * @param {string} email - The email of the user to retrieve.
 * @returns {Promise<object>} A promise that resolves to the user object.
 * @throws {Error} If there is an error retrieving the user.
 */
export async function userGetOneByEmail(email: string) {
  const { data, error } = await tryCatch(
    db.query.user.findFirst({
      where: eq(user.email, email),
    })
  );
  if (error || !data) {
    console.error(error ? error.message : "Error Getting user");
    throw new Error("Error Getting user");
  }
  return data;
}

/**
 * Retrieves the total number of users from the database.
 * @returns {Promise<number>} A promise that resolves to the total number of users.
 * @throws {Error} If there is an error retrieving the user count.
 */
export async function userGetCount() {
  const { data, error } = await tryCatch(
    db.select({ value: count() }).from(user)
  );
  if (error || !data || data.length === 0) {
    console.error(error ? error.message : "Error Getting user count");
    throw new Error("Error Getting user count");
  }
  return data[0].value;
}

export async function userUpdateOne(
  id: string,
  data: Partial<z.infer<typeof userInsertSchema>>
) {
  const { data: updatedUser, error } = await tryCatch(
    db.update(user).set(data).where(eq(user.id, id)).returning()
  );
  if (error || !updatedUser) {
    console.error(error ? error.message : "Error updating user");
    throw new Error("Error updating user");
  }
  return updatedUser[0].id;
}
