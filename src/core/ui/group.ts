import * as p from "@clack/prompts";
import { listGroups } from "../files.js";
import { select, BACK, isBack, type PromptResult } from "./prompt.js";

export interface GroupChoice {
  group: string;
  /** True when the group was picked automatically because it's the only one. */
  auto: boolean;
}

/**
 * Ask which group to operate on, with two shortcuts:
 *   - no groups  -> logs an error and returns null
 *   - one group  -> selects it automatically so the user isn't asked the
 *                   obvious question (and we tell them which group was used)
 * Returns BACK when the user escapes the multi-group picker.
 */
export async function chooseGroup(
  message = "Which group?"
): Promise<GroupChoice | typeof BACK | null> {
  const groups = listGroups();
  if (groups.length === 0) {
    p.log.error("No groups yet. Create one with 'nspt create-group <name>' first.");
    return null;
  }

  if (groups.length === 1) {
    const group = groups[0]!;
    p.log.info(`Using group "${group}"`);
    return { group, auto: true };
  }

  const value: PromptResult<string> = await select({
    message,
    options: groups.map((group) => ({ value: group, label: group })),
  });
  if (isBack(value)) return BACK;
  return { group: value, auto: false };
}
