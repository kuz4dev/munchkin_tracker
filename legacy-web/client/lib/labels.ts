export function getLabel(
  list: readonly { value: string; label: string }[],
  value: string,
): string {
  return list.find((item) => item.value === value)?.label ?? value
}
