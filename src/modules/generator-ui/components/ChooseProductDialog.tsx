// One spacious, centered saved-product picker shared by the Dashboard composer
// and the Make Full Film wizard, so both surfaces use the same title,
// description, category chips and grid geometry. Card rendering stays with each
// caller: the Dashboard renders stored `storage_path` folders through
// UserImageView, while the wizard renders signed URLs through ProductPickerCard.
import type { ReactNode } from 'react'
import { Package } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const CHOOSE_PRODUCT_TITLE = 'Choose a product'
export const CHOOSE_PRODUCT_DESCRIPTION =
  'Select a product folder. Its saved angles will rotate across the film scenes.'

import type { ProductIdentityCategory, ProductIdentityCategoryId } from '@/modules/generator-ui/lib/productIdentity'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories?: readonly ProductIdentityCategory[]
  activeCategory?: ProductIdentityCategoryId
  onCategoryChange?: (id: ProductIdentityCategoryId) => void
  /** Loading / empty / error content rendered instead of the grid. */
  status?: ReactNode
  /** Product folder cards; rendered inside the shared grid. */
  children?: ReactNode
}

export function ChooseProductDialog({
  open,
  onOpenChange,
  categories,
  activeCategory,
  onCategoryChange,
  status,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" aria-hidden="true" />
            {CHOOSE_PRODUCT_TITLE}
          </DialogTitle>
          <DialogDescription>{CHOOSE_PRODUCT_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {status ? (
          status
        ) : (
          <div className="space-y-3">
            {categories && categories.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Product categories">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={activeCategory === category.id}
                    onClick={() => onCategoryChange?.(category.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      activeCategory === category.id
                        ? 'border-accent-warm/60 bg-accent-warm/10 text-accent-warm'
                        : 'border-border bg-surface-2 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {children}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
