export function shouldShowFieldPlaceholder(value: unknown, focused: boolean): boolean {
  return !focused && !value;
}
