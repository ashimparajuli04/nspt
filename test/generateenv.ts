import { readFileSync, write, writeFileSync } from "node:fs";

writeFileSync("src/core/.env", "heheheeeee", { encoding: "utf8" });
writeFileSync("src/.env", "huhuhahaah", { encoding: "utf8" });