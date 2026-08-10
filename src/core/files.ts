import * as fs from "node:fs";
import * as path from "node:path";
import * as toml from "smol-toml";
import { createHash } from "node:crypto";

export interface GroupConfig {
  group: string;
  files: { name: string; path: string }[];
}

const CONFIG_HEADER = `# nspt group configuration
# You can configure nspt for your group here.

# group = "ilovenspt"  i dont know if group name is needed or not here in config

# Example: list the files you want to share with your group in this format
# names are generated from the file path if you use nspt track <groupname> <filepath>

# [[files]]
# name = "env-prod-b26af0b1"
# path = "./.env.prod"

# [[files]]
# name = "src-env-9eabb446"
# path = "./src/.env"

`;

export function createFolder(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    return;
  }
  fs.mkdirSync(folderPath, { recursive: true });
}

export function listGroups(): string[] {
  const root = path.join(process.cwd(), "nspt");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function createGroupConfig(groupPath: string, groupName: string): void {
  const configPath = path.join(groupPath, "config.toml");

  const initialConfig: GroupConfig = {
    group: groupName,
    files: [],
  };

  fs.writeFileSync(configPath, CONFIG_HEADER + toml.stringify(initialConfig));
}

function canonicalizePath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").replace(/^\.\//, "").split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

export function isPathWithinRoot(filePath: string): boolean {
  const root = path.resolve(process.cwd());
  const target = path.resolve(root, filePath);
  if (target === root) return false;
  return target.startsWith(root + path.sep);
}

export function deriveName(filePath: string): string {
  const canonical = canonicalizePath(filePath);
  const readable = canonical
    .replace(/\//g, "-")
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  return readable ? `${readable}-${hash}` : hash;
}

export function addFileToGroupConfig(
  groupPath: string,
  file: { name: string; path: string }
): boolean {
  const configPath = path.join(process.cwd(), "nspt", groupPath, "config.toml");

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    return false;
  }

  const config = toml.parse(raw) as unknown as GroupConfig;
  if (!Array.isArray(config.files)) return false;

  const isDuplicate = config.files.some(
    (f) => f.name === file.name || f.path === file.path
  );
  if (isDuplicate) return false;

  config.files.push(file);
  fs.writeFileSync(configPath, CONFIG_HEADER + toml.stringify(config));
  return true;
}

