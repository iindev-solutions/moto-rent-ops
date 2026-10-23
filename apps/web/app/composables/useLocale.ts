import englishMessages from '../locales/en.json'
import vietnameseMessages from '../locales/vi.json'

export type Locale = 'en' | 'vi'

export type MessageKey = keyof typeof englishMessages

const english: Record<MessageKey, string> = englishMessages
const vietnamese: Record<MessageKey, string> = vietnameseMessages

const messages = { en: english, vi: vietnamese }

const statusKeys: Record<string, MessageKey> = {
  available: 'status.available',
  reserved: 'status.reserved',
  rented: 'status.rented',
  inspection: 'status.inspection',
  maintenance: 'status.maintenance',
  blocked: 'status.blocked',
  retired: 'status.retired',
  planned: 'status.planned',
  due: 'status.due',
  in_progress: 'status.inProgress',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
  overdue: 'status.overdue',
  partially_allocated: 'status.partiallyAllocated',
  settled: 'status.settled',
  held: 'status.held',
  applied: 'status.applied',
  returned: 'status.returned',
  draft: 'status.draft',
  ready: 'status.ready',
  active: 'status.active',
  open: 'status.open',
  investigating: 'status.investigating',
  resolved: 'status.resolved',
  closed: 'status.closed',
  expired: 'status.expired',
  expiring_soon: 'status.expiringSoon',
  valid: 'status.valid',
  pending: 'notifications.statusPending',
  processing: 'notifications.statusProcessing',
  sent: 'notifications.statusSent',
  dead_letter: 'notifications.statusDeadLetter',
}

const priorityKeys: Record<string, MessageKey> = {
  low: 'priority.low',
  medium: 'priority.medium',
  high: 'priority.high',
}

const depositTypeKeys: Record<string, MessageKey> = {
  cash: 'deposit.cash',
  document_custody: 'deposit.documentCustody',
}

const obligationTypeKeys: Record<string, MessageKey> = {
  rent: 'obligation.rent',
  rent_extension: 'obligation.rentExtension',
}

const maintenanceTypeKeys: Record<string, MessageKey> = {
  service: 'maintenance.typeService',
  repair: 'maintenance.typeRepair',
  inspection: 'maintenance.typeInspection',
}

const channelKeys: Record<string, MessageKey> = {
  phone: 'channel.phone',
  telegram: 'channel.telegram',
  whatsapp: 'channel.whatsapp',
  email: 'channel.email',
}

const paymentMethodKeys: Record<string, MessageKey> = {
  cash: 'method.cash',
  'bank transfer': 'method.bankTransfer',
  bank_transfer: 'method.bankTransfer',
  momo: 'method.momo',
  zalopay: 'method.zaloPay',
  'zalo pay': 'method.zaloPay',
}

export function useLocale() {
  const locale = useState<Locale>('moto-locale', () => {
    if (!import.meta.client) return 'en'
    try {
      const stored = localStorage.getItem('moto-locale')
      if (stored === 'en' || stored === 'vi') return stored
      return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
    } catch {
      return 'en'
    }
  })
  const t = (key: MessageKey) => messages[locale.value][key] ?? messages.en[key]
  const setLocale = (next: Locale) => {
    locale.value = next
    if (import.meta.client) {
      localStorage.setItem('moto-locale', next)
      document.documentElement.lang = next
    }
  }

  onMounted(() => {
    document.documentElement.lang = locale.value
  })

  const mapLabel = (keys: Record<string, MessageKey>, value: string | null | undefined) => {
    if (!value) return '—'
    const key = keys[value]
    return key ? t(key) : value
  }
  const tStatus = (value: string | null | undefined) => mapLabel(statusKeys, value)
  const tPriority = (value: string | null | undefined) => mapLabel(priorityKeys, value)
  const tDepositType = (value: string | null | undefined) => mapLabel(depositTypeKeys, value)
  const tObligationType = (value: string | null | undefined) => mapLabel(obligationTypeKeys, value)
  const tMaintenanceType = (value: string | null | undefined) => mapLabel(maintenanceTypeKeys, value)
  const tChannel = (value: string | null | undefined) => mapLabel(channelKeys, value)
  const tMethod = (value: string | null | undefined) => mapLabel(paymentMethodKeys, value)

  return { locale, t, setLocale, tStatus, tPriority, tDepositType, tObligationType, tMaintenanceType, tChannel, tMethod }
}
