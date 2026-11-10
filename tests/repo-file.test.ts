import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileRepo } from "@/lib/repo-file";
import { repoContract } from "./repo-contract";

let dir = "";
repoContract(
  "FileRepo",
  async () => {
    dir = mkdtempSync(path.join(tmpdir(), "shopsitter-"));
    return new FileRepo(dir);
  },
  () => new FileRepo(dir),
);
