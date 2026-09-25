export type BikeSummary = {
  id: string
  assetCode: string
  model: string
  plate: string | null
  status: string
  location: string | null
  nextAction: string | null
}

export type DepositType = 'document_custody' | 'cash_2m_vnd' | 'cash_5m_vnd'

export type DepositSummary = {
  type: DepositType
  amountVnd: number | null
  documentType: string | null
  documentMasked: string | null
  receivedAt: string | null
  returnedAt: string | null
}
