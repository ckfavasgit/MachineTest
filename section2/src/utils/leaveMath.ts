const MS_PER_DAY = 24 * 60 * 60 * 1000

export function clampToYyyyMmDd(value: string): string {
  return value.trim()
}

export function isValidYyyyMmDd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime())
}

export function compareYyyyMmDd(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00.000Z`).getTime()
  const db = new Date(`${b}T00:00:00.000Z`).getTime()
  return da === db ? 0 : da < db ? -1 : 1
}

export function calculateDurationDays(
  startDate: string,
  endDate: string,
  halfDay: boolean,
): number {
  if (halfDay) return 0.5
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime()
  const diffDays = Math.floor((end - start) / MS_PER_DAY) + 1
  return diffDays
}

