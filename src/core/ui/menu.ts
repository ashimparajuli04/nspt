import { SelectPrompt, settings, wrapTextWithPrefix } from "@clack/core";
import {
  S_BAR,
  S_BAR_END,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  SELECT_INSTRUCTIONS,
  formatInstructionFooter,
  limitOptions,
  symbol,
  symbolBar,
} from "@clack/prompts";
import { styleText } from "node:util";
import type { Writable } from "node:stream";
import { BACK, withBack, type PromptResult } from "./prompt.js";

export type MenuOption<Value> = {
  value: Value;
  label: string;
  icon?: string;
  hint?: string;
  disabled?: boolean;
};

export async function menuSelect<Value>(opts: {
  message: string;
  options: MenuOption<Value>[];
  initialValue?: Value | undefined;
  maxItems?: number;
  withGuide?: boolean;
  output?: Writable | undefined;
}): Promise<PromptResult<Value>> {
  return withBack<Value>(() =>
    new SelectPrompt<MenuOption<Value>>({
      options: opts.options,
      ...(opts.initialValue !== undefined ? { initialValue: opts.initialValue } : {}),
      ...(opts.output !== undefined ? { output: opts.output } : {}),
      render() {
        const withGuide = opts.withGuide ?? settings.withGuide;
        const messagePrefix = `${symbolBar(this.state)}  `;
        const optionPrefix = `${symbol(this.state)}  `;
        const header = `${withGuide ? `${styleText("gray", S_BAR)}\n` : ""}${wrapTextWithPrefix(
          opts.output,
          opts.message,
          messagePrefix,
          optionPrefix
        )}\n`;

        const renderOption = (option: MenuOption<Value> | undefined, mode: string): string => {
          if (option === undefined) return "";
          const label = option.label;
          const icon = option.icon ?? S_RADIO_ACTIVE;
          const inactiveIcon = option.icon ?? S_RADIO_INACTIVE;
          const hint = option.hint ? ` ${styleText("dim", `(${option.hint})`)}` : "";
          switch (mode) {
            case "disabled":
              return `${styleText("gray", inactiveIcon)} ${styleText(["strikethrough", "gray"], label)}${hint}`;
            case "selected":
              return styleText("dim", label);
            case "active":
              return `${styleText("green", icon)} ${label}${hint}`;
            case "cancelled":
              return styleText(["strikethrough", "dim"], label);
            default:
              return `${styleText("dim", inactiveIcon)} ${styleText("dim", label)}`;
          }
        };

        switch (this.state) {
          case "submit": {
            const prefix = withGuide ? `${styleText("gray", S_BAR)}  ` : "";
            const line = wrapTextWithPrefix(
              opts.output,
              renderOption(this.options[this.cursor], "selected"),
              prefix
            );
            return `${header}${line}`;
          }
          case "cancel": {
            const prefix = withGuide ? `${styleText("gray", S_BAR)}  ` : "";
            const line = wrapTextWithPrefix(
              opts.output,
              renderOption(this.options[this.cursor], "cancelled"),
              prefix
            );
            return `${header}${line}${withGuide ? `\n${styleText("gray", S_BAR)}` : ""}`;
          }
          default: {
            const prefix = withGuide ? `${styleText("cyan", S_BAR)}  ` : "";
            const footer = formatInstructionFooter(SELECT_INSTRUCTIONS, withGuide).join("\n");
            const rowPadding = header.split("\n").length + footer.split("\n").length + 1;
            return `${header}${prefix}${limitOptions({
              ...(opts.output !== undefined ? { output: opts.output } : {}),
              cursor: this.cursor,
              options: this.options,
              ...(opts.maxItems !== undefined ? { maxItems: opts.maxItems } : {}),
              columnPadding: prefix.length,
              rowPadding,
              style: (option, active) =>
                renderOption(option, option.disabled ? "disabled" : active ? "active" : "inactive"),
            }).join(`\n${prefix}`)}\n${footer}\n`;
          }
        }
      },
    }).prompt()
  );
}
