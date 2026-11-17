import type { Repository } from "./repository.ts";
import { MemoryRepository } from "./memory.ts";
import { PostgresRepository } from "./pg.ts";
import { isDemoMode } from "../pbi/index.ts";

export function createRepository(): Repository {
  if (isDemoMode() || !process.env.DATABASE_URL) {
    return new MemoryRepository();
  }
  // pg.ts loads the `pg` driver lazily via dynamic import, so this static import is safe.
  return new PostgresRepository();
}

export * from "./repository.ts";
