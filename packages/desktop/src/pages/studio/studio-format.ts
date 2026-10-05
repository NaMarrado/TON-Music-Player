/** m:ss for lengths, with tenths where it helps while editing. */
export function formatClock(seconds: number, tenths = false): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const base = `${minutes}:${String(whole).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((rest - whole) * 10)}` : base;
}

/** Colour of a Camelot key chip: neighbouring keys on the wheel get neighbouring hues. */
export function camelotColor(camelot: string): string {
  const number = Number.parseInt(camelot, 10);
  const hue = Number.isFinite(number) ? ((number - 1) * 30 + 150) % 360 : 0;
  return `hsl(${hue} 62% 58%)`;
}
