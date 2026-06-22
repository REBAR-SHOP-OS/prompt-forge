import ProductAdDialog from './ProductAdDialog'

type CharacterSheetDuration = 5 | 10 | 15 | 30 | 45 | 135

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDuration: CharacterSheetDuration
  userId: string | null
  onUseAsPrompt: (scenario: string, imageUrl?: string) => void
  onSendScenes?: (scenes: string[], imageUrl?: string) => void | Promise<void>
}

/**
 * Character Sheet dialog — reuses the scenario generator UI in "character" variant.
 * The user always uploads a character image; the AI analyzes it (descriptive
 * reference only) and writes a cinematic film scenario built around that character.
 */
export default function CharacterSheetDialog(props: Props) {
  return <ProductAdDialog {...props} variant="character" />
}
