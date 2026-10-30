export type BikeSummary = {
  id: string
  assetCode: string
  model: string
  plate: string | null
  photoUrl?: string | null
  status: string
  location: string | null
  nextAction: string | null
  qrToken?: string | null
  manualCode?: string | null
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

export type UpcomingPayment = {
  id: string
  clientName: string | null
  type: string
  amountMinor: number
  balanceMinor: number
  currency: string
  dueDate: string
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
  upcomingPayments: UpcomingPayment[]
}

export type PageMeta = {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export type BikesResponse = {
  bikes: BikeSummary[]
} & PageMeta

export type ClientSummary = {
  id: string
  displayName: string
  preferredChannel: string
  contactCount: number
  openDocumentCount: number
  activeAgreementCount: number
}

export type ClientsResponse = {
  clients: ClientSummary[]
} & PageMeta

export type AgreementVersion = {
  id: string
  version: number
  status: string
  changeReason: string
  startDate: string | null
  endDate: string | null
  itemCount: number
  createdAt: string
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

export type DocumentExpiryStatus = 'expired' | 'expiring_soon' | 'valid'

export type LocationAssignment = {
  id: string
  location: string
  note: string | null
  startedAt: string
  endedAt: string | null
  actorName: string | null
}

export type DocumentCustody = {
  id: string
  documentType: string
  maskedNumber: string | null
  expiresAt: string | null
  expiryStatus: DocumentExpiryStatus | null
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

export type PaymentReceipt = ReceiptSummary & {
  clientName: string | null
}

export type PaymentDue = ObligationSummary & {
  clientName: string | null
  dueDate: string
}

export type PaymentsData = {
  month: string
  receipts: PaymentReceipt[]
  due: PaymentDue[]
  totals: {
    receivedMinor: number
    dueMinor: number
    overdueMinor: number
  }
  counts: {
    receipts: number
    due: number
    overdue: number
  }
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
