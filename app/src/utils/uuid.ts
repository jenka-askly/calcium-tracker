// Purpose: Generate UUIDs using Expo Crypto randomness to avoid missing getRandomValues in RN.
// Persists: None.
// Security Risks: Generates identifiers used in request headers and device settings.
import * as Crypto from "expo-crypto";
import { v4 as uuidv4 } from "uuid";

export async function createUuidV4(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  return uuidv4({ random: randomBytes });
}
