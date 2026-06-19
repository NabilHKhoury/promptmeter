import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { loadModels } from "./models.js";
import { Overlay } from "./tui.js";

const models = loadModels();
const tick = () => new Promise((r) => setTimeout(r, 30));
const DOWN = "[B";
const ENTER = "\r";
const ESC = "";

describe("<Overlay>", () => {
  it("renders the panel and the three actions", async () => {
    const { lastFrame } = render(
      <Overlay
        panel="PANEL_MARKER"
        models={models}
        currentModel="claude-sonnet-4-6"
        onDone={() => {}}
      />,
    );
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("PANEL_MARKER");
    expect(f).toContain("Proceed");
    expect(f).toContain("Switch model");
    expect(f).toContain("Cancel");
  });

  it("Enter on the default selection → onDone('proceed')", async () => {
    const onDone = vi.fn();
    const { stdin } = render(
      <Overlay
        panel="P"
        models={models}
        currentModel="claude-sonnet-4-6"
        onDone={onDone}
      />,
    );
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onDone).toHaveBeenCalledWith("proceed", undefined);
  });

  it("navigating to Cancel + Enter → onDone('cancel')", async () => {
    const onDone = vi.fn();
    const { stdin } = render(
      <Overlay
        panel="P"
        models={models}
        currentModel="claude-sonnet-4-6"
        onDone={onDone}
      />,
    );
    await tick();
    stdin.write(DOWN);
    await tick();
    stdin.write(DOWN);
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onDone).toHaveBeenCalledWith("cancel", undefined);
  });

  it("Esc → onDone('cancel')", async () => {
    const onDone = vi.fn();
    const { stdin } = render(
      <Overlay
        panel="P"
        models={models}
        currentModel="claude-sonnet-4-6"
        onDone={onDone}
      />,
    );
    await tick();
    stdin.write(ESC);
    await tick();
    expect(onDone).toHaveBeenCalledWith("cancel", undefined);
  });

  it("Switch model → selecting a model → onDone('switch', id)", async () => {
    const onDone = vi.fn();
    const { stdin } = render(
      <Overlay
        panel="P"
        models={models}
        currentModel="claude-sonnet-4-6"
        onDone={onDone}
      />,
    );
    await tick();
    stdin.write(DOWN); // move to "Switch model"
    await tick();
    stdin.write(ENTER); // enter model-select mode
    await tick();
    stdin.write(ENTER); // select the first model
    await tick();
    expect(onDone).toHaveBeenCalledWith("switch", models[0].id);
  });
});
