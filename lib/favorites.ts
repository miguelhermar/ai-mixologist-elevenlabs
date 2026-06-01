/**
 * Store for saved-favorite cocktails. Backs the `save_favorite` server tool.
 *
 * Two interchangeable backends, selected purely by configuration:
 *   - **Upstash Redis** when configured (production / serverless, where the
 *     filesystem is read-only). Key `last-call:favorites` holds the JSON array.
 *   - **Local JSON file** otherwise (`npm run dev`, tests) — a single gitignored
 *     file, read-modify-write, inspectable and restart-surviving.
 *
 * Both keep the same read-modify-write semantics, so the route + tests are
 * unchanged. Concurrency is not a concern at this scale.
 */

import { promises as fs } from "fs";
import path from "path";
import { createLogger } from "@/lib/logger";
import { getRedis, KV_PREFIX } from "@/lib/kv";

const log = createLogger("favorites");

/** Redis key holding the full `Favorite[]` as JSON (mirrors the file's `favorites` array). */
const REDIS_KEY = `${KV_PREFIX}:favorites`;

/** A persisted favorite. `savedAt` is an ISO timestamp set at write time. */
export interface Favorite {
  id: string;
  name: string;
  savedAt: string;
}

/** Default store location (gitignored). Overridable for tests via the `filePath` arg. */
export function defaultFavoritesPath(): string {
  return path.join(process.cwd(), ".data", "favorites.json");
}

/** Read the favorites array from Redis (empty if unset). */
async function readRedis(): Promise<Favorite[]> {
  const redis = getRedis();
  if (!redis) return [];
  // @upstash/redis auto-deserializes JSON, so a stored array comes back as an array.
  const value = await redis.get<Favorite[]>(REDIS_KEY);
  return Array.isArray(value) ? value : [];
}

async function readRaw(filePath: string): Promise<Favorite[]> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as { favorites?: Favorite[] };
    return Array.isArray(parsed.favorites) ? parsed.favorites : [];
  } catch (err) {
    // Missing file (first write) is expected — start empty. Re-throw anything else.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Read all favorites (empty array if the store doesn't exist yet). */
export async function readFavorites(
  filePath = defaultFavoritesPath()
): Promise<Favorite[]> {
  if (getRedis()) return readRedis();
  return readRaw(filePath);
}

/**
 * Append a favorite and return the updated list. Uses Redis when configured,
 * else the local JSON file (creating it + its parent dir on first write).
 */
export async function addFavorite(
  fav: { id: string; name: string },
  filePath = defaultFavoritesPath()
): Promise<Favorite[]> {
  const redis = getRedis();
  if (redis) {
    const favorites = await readRedis();
    favorites.push({ id: fav.id, name: fav.name, savedAt: new Date().toISOString() });
    await redis.set(REDIS_KEY, favorites);
    log.debug("favorite saved (redis)", { count: favorites.length });
    return favorites;
  }

  const favorites = await readRaw(filePath);
  favorites.push({ id: fav.id, name: fav.name, savedAt: new Date().toISOString() });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ favorites }, null, 2), "utf8");
  log.debug("favorite saved", { count: favorites.length });
  return favorites;
}
