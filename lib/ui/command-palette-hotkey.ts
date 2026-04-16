export function isPaletteHotkey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  const key = event.key.toLowerCase();
  return key === 'k';
}
