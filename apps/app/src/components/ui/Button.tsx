import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native'

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
type Size = 'default' | 'sm' | 'lg' | 'icon'

const variants: Record<Variant, { box: string; text: string; spinner: string }> = {
  default: { box: 'bg-primary', text: 'text-primary-foreground', spinner: '#faf8f5' },
  outline: { box: 'border border-border bg-card', text: 'text-foreground', spinner: '#1e130e' },
  secondary: { box: 'bg-secondary', text: 'text-secondary-foreground', spinner: '#3a2a20' },
  ghost: { box: '', text: 'text-muted-foreground', spinner: '#6d6059' },
  destructive: { box: 'bg-destructive', text: 'text-white', spinner: '#ffffff' },
}

const sizes: Record<Size, { box: string; text: string }> = {
  default: { box: 'h-12 px-5', text: 'text-base' },
  sm: { box: 'h-9 px-3', text: 'text-sm' },
  lg: { box: 'h-14 px-6', text: 'text-lg' },
  icon: { box: 'h-11 w-11', text: 'text-xl' },
}

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title?: string
  children?: ReactNode
  variant?: Variant
  size?: Size
  loading?: boolean
  className?: string
  textClassName?: string
}

export function Button({
  title,
  children,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  className = '',
  textClassName = '',
  ...props
}: ButtonProps) {
  const v = variants[variant]
  const s = sizes[size]
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      className={`flex-row items-center justify-center gap-2 rounded-xl active:opacity-75 ${v.box} ${s.box} ${inactive ? 'opacity-50' : ''} ${className}`}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={v.spinner} />}
      {title !== undefined && (
        <Text className={`font-semibold ${v.text} ${s.text} ${textClassName}`}>{title}</Text>
      )}
      {children}
    </Pressable>
  )
}
