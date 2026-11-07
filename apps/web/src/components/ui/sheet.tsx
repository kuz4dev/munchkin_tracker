import { X } from 'lucide-react'
import { Dialog as DialogPrimitive, AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from 'cn'

/** Bottom sheet on a Radix dialog: the warm-modern replacement for popups and selects. */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const sheetClass =
  'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[32px] bg-card text-card-foreground shadow-[0_-12px_40px_rgba(58,36,32,0.25)] outline-none duration-300 ease-out data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom'
const handleClass = 'mx-auto mt-2.5 mb-1.5 h-[5px] w-11 shrink-0 rounded-full bg-border'
const scrollClass = 'overflow-y-auto overscroll-contain px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))]'
const closeClass =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95'

const overlayClass =
  'fixed inset-0 z-50 bg-cocoa/55 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'

interface SheetContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Small line above the title */
  eyebrow?: ReactNode
  /** Icon tile left of the title */
  icon?: ReactNode
  /** Visually hide the description (it is still announced) */
  hideDescription?: boolean
  /** Visually hide the title, when the content has its own big heading */
  hideTitle?: boolean
}

export function SheetContent({
  title,
  description,
  eyebrow,
  icon,
  hideDescription = false,
  hideTitle = false,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(sheetClass, className)}
        {...props}
      >
        <div className={handleClass} aria-hidden="true" />
        <div className={scrollClass}>
          <div className={cn('flex items-start justify-between gap-3', hideTitle && 'justify-end')}>
            <div className="flex min-w-0 items-center gap-3.5">
              {icon && (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mustard text-cocoa [&_svg]:size-6">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                {eyebrow && <p className="text-[13px] font-bold text-primary">{eyebrow}</p>}
                <DialogPrimitive.Title className={cn('font-display text-[22px] leading-tight font-extrabold', hideTitle && 'sr-only')}>
                  {title}
                </DialogPrimitive.Title>
              </div>
            </div>
            <DialogPrimitive.Close aria-label="Закрыть" className={closeClass}>
              <X className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description
              className={cn('mt-3 text-[15px] leading-snug text-muted-foreground', hideDescription && 'sr-only')}
            >
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  art?: ReactNode
  /** Extra controls between the description and the buttons */
  children?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
}

/** A sheet like the others, for confirming actions that are hard to undo. */
export function ConfirmDialog({ open, onOpenChange, title, description, art, children, confirmLabel, cancelLabel, onConfirm }: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        {/* An alert dialog ignores taps outside by default; every other sheet closes on them */}
        <AlertDialogPrimitive.Overlay className={overlayClass} onClick={() => onOpenChange(false)} />
        <AlertDialogPrimitive.Content className={sheetClass}>
          <div className={handleClass} aria-hidden="true" />
          <div className={cn(scrollClass, 'text-center')}>
            <div className="flex justify-end">
              <AlertDialogPrimitive.Cancel aria-label="Закрыть" className={closeClass}>
                <X className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
              </AlertDialogPrimitive.Cancel>
            </div>
            <div className="-mt-6">{art}</div>
            <AlertDialogPrimitive.Title className="mt-4 font-display text-[22px] leading-tight font-extrabold">{title}</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="mt-2.5 text-[15px] leading-snug text-muted-foreground">
              {description}
            </AlertDialogPrimitive.Description>
            {children}
            <AlertDialogPrimitive.Action
              onClick={onConfirm}
              className="mt-[22px] h-14 w-full rounded-[18px] bg-cocoa font-display text-[15px] font-semibold text-primary-foreground transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
            <AlertDialogPrimitive.Cancel className="mt-2 h-[50px] w-full rounded-[18px] text-[15px] font-bold outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50">
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

/** Round check mark for the selected option. */
export function CheckDot({ checked, tone = 'primary' }: { checked: boolean; tone?: 'primary' | 'mustard' }) {
  return checked ? (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        tone === 'mustard' ? 'bg-mustard text-cocoa' : 'bg-primary text-primary-foreground',
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 5 5 9-10" />
      </svg>
    </span>
  ) : (
    // The same box as the check, so nothing shifts when a tile gets selected
    <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="size-6 rounded-full border-2 border-border bg-card" />
    </span>
  )
}
