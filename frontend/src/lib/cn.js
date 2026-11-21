/** Join class names, skipping empty ones: cn('a', isOn && 'b') */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
