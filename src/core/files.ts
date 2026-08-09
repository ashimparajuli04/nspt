import * as fs from "node:fs";
import * as path from "node:path";
import * as toml from "smol-toml";

export interface GroupConfig {
  group: string;
  files: { name: string; path: string }[];
}

const CONFIG_HEADER = `# nspt group configuration
# You can configure nspt for your group here.
#
# Example: list the files you want to share with your group
#   files = [
#     { name = ".env",        path = "./.env" },
#     { name = ".env.prod",   path = "./.env.prod" },
#     { name = "config.yml",  path = "./config/config.yml" },
#   ]

`;

export function createFolder(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    return;
  }
  fs.mkdirSync(folderPath, { recursive: true });
}

export function createGroupConfig(groupPath: string, groupName: string): void {
  const configPath = path.join(groupPath, "config.toml");

  const initialConfig: GroupConfig = {
    group: groupName,
    files: [],
  };

  fs.writeFileSync(configPath, CONFIG_HEADER + toml.stringify(initialConfig));
}