import { describe, it } from "vitest";
import { PostgresRepo } from "@/lib/repo-postgres";
import { repoContract } from "./repo-contract";

// Runs against a real database when DATABASE_URL is set (for example `vercel env pull`),
// in tables prefixed "test_" so real data is never touched.
const url = process.env.DATABASE_URL;

if (url) {
  repoContract(
    "PostgresRepo",
    async () => {
      const repo = new PostgresRepo(url, "test_");
      await repo.wipeForTests();
      return repo;
    },
    () => new PostgresRepo(url, "test_"),
  );
} else {
  describe("PostgresRepo", () => {
    it.skip("needs DATABASE_URL to run", () => {});
  });
}
