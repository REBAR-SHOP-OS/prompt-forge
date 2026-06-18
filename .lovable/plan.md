Move the "Use as soundtrack" button from the generated-audio preview panel into the DialogFooter, placing it next to the "Download" button.

1. Remove the `onUseAsSoundtrack` button block (lines 477-488) from inside the `audioUrl` preview panel.
2. Add a "Use as soundtrack" button inside `<DialogFooter>` before the "Download" button, keeping the same icon, disabled state (`!audioUrl`), and click handler.

No other logic changes.