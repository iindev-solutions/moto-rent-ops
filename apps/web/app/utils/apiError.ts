export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { statusMessage?: string, message?: string } } | null)?.data
  return data?.statusMessage || data?.message || fallback
}
