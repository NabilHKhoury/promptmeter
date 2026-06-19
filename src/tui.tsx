import { useState } from "react";
import { Box, Text, useApp, useInput, render } from "ink";
import type { Model } from "./models.js";
import type { OverlayAction } from "./overlay.js";

export interface OverlayProps {
  panel: string;
  models: Model[];
  currentModel: string;
  onDone: (action: OverlayAction, model?: string) => void;
}

const MENU: { label: string; action: OverlayAction }[] = [
  { label: "Proceed", action: "proceed" },
  { label: "Switch model", action: "switch" },
  { label: "Cancel", action: "cancel" },
];

/**
 * The pre-run panel + [Proceed] · [Switch model] · [Cancel]. Choosing "Switch
 * model" reveals the Claude family; selecting one resolves with that model.
 * Esc cancels. Thin shell — all decision logic lives in src/overlay.ts.
 */
export function Overlay({ panel, models, currentModel, onDone }: OverlayProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<"menu" | "models">("menu");
  const [sel, setSel] = useState(0);

  const items =
    mode === "menu"
      ? MENU.map((m) => m.label)
      : models.map((m) => `${m.display_name} (${m.id})`);

  const finish = (action: OverlayAction, model?: string): void => {
    onDone(action, model);
    exit();
  };

  useInput((_input, key) => {
    if (key.upArrow) {
      setSel((s) => (s - 1 + items.length) % items.length);
    } else if (key.downArrow) {
      setSel((s) => (s + 1) % items.length);
    } else if (key.escape) {
      finish("cancel");
    } else if (key.return) {
      if (mode === "menu") {
        const action = MENU[sel].action;
        if (action === "switch") {
          setMode("models");
          setSel(0);
        } else {
          finish(action);
        }
      } else {
        finish("switch", models[sel].id);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{panel}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {mode === "menu"
            ? "Choose an action (↑/↓, Enter; Esc cancels):"
            : `Switch model — current ${currentModel} (↑/↓, Enter):`}
        </Text>
        {items.map((label, i) => (
          <Text key={i} color={i === sel ? "cyan" : undefined}>
            {i === sel ? "› " : "  "}
            {label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Render the overlay and resolve with the chosen action/model. **Never throws**
 * (review C1): `useInput` crashes on a non-TTY, so any Ink error resolves to a
 * safe `{action:"proceed"}` rather than breaking the hand-off. The strict
 * `shouldShowOverlay` guard means this fallback should not normally be reached.
 */
export async function runOverlay(
  panel: string,
  models: Model[],
  currentModel: string,
): Promise<{ action: OverlayAction; model?: string }> {
  try {
    let result: { action: OverlayAction; model?: string } = {
      action: "proceed",
    };
    const instance = render(
      <Overlay
        panel={panel}
        models={models}
        currentModel={currentModel}
        onDone={(action, model) => {
          result = { action, model };
        }}
      />,
    );
    await instance.waitUntilExit();
    return result;
  } catch {
    return { action: "proceed" };
  }
}
