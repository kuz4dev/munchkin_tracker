import { View, type ViewProps } from 'react-native'

export function Card({ className = '', ...props }: ViewProps & { className?: string }) {
  return <View className={`overflow-hidden rounded-2xl border-2 border-border bg-card ${className}`} {...props} />
}
