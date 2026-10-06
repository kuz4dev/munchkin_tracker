import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'

export const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(function Input(
  { className = '', ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#6d6059"
      className={`h-12 rounded-xl border border-input bg-card px-4 text-base text-foreground ${className}`}
      {...props}
    />
  )
})
