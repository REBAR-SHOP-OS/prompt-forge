export function spliceRegeneratedCard(
  currentManualOrder: string[] | null,
  displayedClipIds: string[],
  oldId: string,
  newId: string
): string[] {
  // If we already have a manual order, patch the new ID precisely where the old one was.
  if (currentManualOrder) {
    const nextOrder = [...currentManualOrder]
    const oldIdx = nextOrder.indexOf(oldId)
    if (oldIdx >= 0) {
      nextOrder.splice(oldIdx, 1, newId)
    }
    return nextOrder
  }

  // If no manual order exists, the workspace is currently relying on chronological
  // ASC sorting from displayedClips. We must capture that exact ordered arrangement
  // right now to prevent the new seeded card from jumping to the end.
  const capturedOrder = [...displayedClipIds]
  const oldIdx = capturedOrder.indexOf(oldId)
  if (oldIdx >= 0) {
    capturedOrder.splice(oldIdx, 1, newId)
  }
  return capturedOrder
}
