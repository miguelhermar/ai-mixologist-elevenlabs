import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { addFavorite, readFavorites } from "./favorites";

describe("favorites store", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "last-call-fav-"));
    file = path.join(dir, "nested", "favorites.json"); // nested → exercises mkdir
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns [] when the store does not exist yet", async () => {
    expect(await readFavorites(file)).toEqual([]);
  });

  it("creates the file/dir on first write and round-trips", async () => {
    const after = await addFavorite({ id: "11007", name: "Margarita" }, file);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: "11007", name: "Margarita" });
    expect(after[0].savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const reread = await readFavorites(file);
    expect(reread).toHaveLength(1);
    expect(reread[0].name).toBe("Margarita");
  });

  it("appends across multiple writes", async () => {
    await addFavorite({ id: "1", name: "A" }, file);
    const after = await addFavorite({ id: "2", name: "B" }, file);
    expect(after.map((f) => f.id)).toEqual(["1", "2"]);
  });
});
