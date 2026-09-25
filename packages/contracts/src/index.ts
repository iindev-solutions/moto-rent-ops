export type BikeSummary = {
  id: string
  assetCode: string
  model: string
  plate: string | null
  status: string
  location: string | null
  nextAction: string | null
  qrToken?: string | null
}

export type DepositType = 'document_custody' | 'cash'

export const DEFAULT_DEPOSIT_PRESETS_VND = [2_000_000, 5_000_000] as const

export type DepositSummary = {
  type: DepositType
  amountVnd: number | null
  documentType: string | null
  documentMasked: string | null
  receivedAt: string | null
  returnedAt: string | null
}

export type DashboardData = {
  stats: {
    total: number
    available: number
    rented: number
    attention: number
  }
  recentBikes: BikeSummary[]
}
