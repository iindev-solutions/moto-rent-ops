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

export type TodayQueueEntry = {
  id: string
  title: string | null
  assetCode: string | null
  model: string | null
  type: string | null
  priority: string | null
  amountMinor: number | null
  currency: string | null
  clientName: string | null
  date: string | null
  href: string | null
}

export type TodayQueue = {
  handovers: TodayQueueEntry[]
  returns: TodayQueueEntry[]
  activeRentals: TodayQueueEntry[]
  overdueObligations: TodayQueueEntry[]
  maintenanceDue: TodayQueueEntry[]
  openIncidents: TodayQueueEntry[]
  depositsPending: TodayQueueEntry[]
}

export type DashboardData = {
  stats: {
    total: number
    available: number
    rented: number
    attention: number
  }
  recentBikes: BikeSummary[]
  queues: TodayQueue
}

export type BikesResponse = {
  bikes: BikeSummary[]
}

export type ClientSummary = {
  id: string
  displayName: string
  preferredChannel: string
  contactCount: number
  openDocumentCount: number
  activeAgreementCount: number
}

export type ClientContact = {
  id: string
  channel: string
  value: string
  isPrimary: boolean
}

export type AttachmentSummary = {
  id: string
  contentType: string
}

export type DocumentCustody = {
  id: string
  documentType: string
  maskedNumber: string | null
  status: string
  receivedAt: string
  returnedAt: string | null
  notes: string | null
  attachments?: AttachmentSummary[]
}

export type RentalAgreementSummary = {
  id: string
  status: string
  version: number
  startDate: string | null
  endDate: string | null
  itemCount: number
}

export type RentalItemSummary = {
  id: string
  motorcycleId: string
  assetCode: string
  model: string
  startDate: string
  endDate: string
  dailyRateMinor: number
  currency: string
  status: string
}

export type HandoverSummary = {
  id: string
  motorcycleId: string
  odometer: number | null
  fuelLevel: string | null
  damageNotes: string | null
  createdAt: string
}

export type ClientDetail = {
  client: ClientSummary
  contacts: ClientContact[]
  documents: DocumentCustody[]
  agreements: RentalAgreementSummary[]
}

export type ObligationSummary = {
  id: string
  type: string
  status: string
  amountMinor: number
  allocatedMinor: number
  balanceMinor: number
  currency: string
  dueDate: string | null
  clientId: string | null
}

export type ReceiptSummary = {
  id: string
  amountMinor: number
  currency: string
  method: string
  receivedAt: string
  clientId: string | null
}

export type DepositSummaryV2 = {
  id: string
  type: string
  status: string
  amountMinor: number | null
  currency: string
  clientId: string
  receivedAt: string
  returnedAt: string | null
}

export type QuickRentalResult = {
  clientId: string
  agreementId: string
  itemId: string
  handoverId: string | null
  depositId: string | null
  documentCustodyId: string | null
}

export type ActiveRentalSummary = {
  itemId: string
  agreementId: string
  clientId: string
  clientName: string
  assetCode: string
  model: string
  plate: string | null
  location: string | null
  startDate: string
  endDate: string
  dailyRateMinor: number
  currency: string
}

export type SettlementObligation = {
  id: string
  type: string
  amountMinor: number
  dueMinor: number
}

export type RentalItemSettlement = {
  itemId: string
  agreementId: string
  clientId: string
  itemStatus: string
  agreementStatus: string
  currency: string
  obligations: SettlementObligation[]
  totalDueMinor: number
  deposit: {
    id: string
    type: string
    amountMinor: number | null
    status: string
    remainingMinor: number
  } | null
  document: {
    id: string
    documentType: string
    status: string
  } | null
}

export type PeopleSearchItem = {
  id: string
  displayName: string
  phone: string | null
}
