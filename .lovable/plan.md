Add an "Apply" button to the Voiceover dialog footer that closes the dialog and confirms the current voiceover settings.

### Change
In `src/modules/generator-ui/components/VoiceoverDialog.tsx`:
- Import `Check` from `lucide-react`.
- Add an "Apply" button between the existing "Download" and "Close" buttons in `DialogFooter`.
- Clicking it calls `onOpenChange(false)` to close the dialog.
- The button uses the same styling as the other footer buttons and shows a check icon with the label "Apply".

No other files need changes.