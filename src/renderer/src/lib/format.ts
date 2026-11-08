import type { BadgeTone } from '../components/ui/badge'

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  MOBILE_WALLET: 'Mobile Wallet',
  CHEQUE: 'Cheque'
}

export function methodLabel(m: string): string {
  return METHOD_LABELS[m] ?? m
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  FINALIZED: 'Unpaid',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded'
}

export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s
}

export function statusTone(s: string): BadgeTone {
  switch (s) {
    case 'PAID':
      return 'success'
    case 'PARTIALLY_PAID':
      return 'warning'
    case 'FINALIZED':
      return 'info'
    case 'CANCELLED':
    case 'REFUNDED':
      return 'danger'
    default:
      return 'neutral'
  }
}

// ---------- Laboratory workflow (Checkpoint 3) ----------

export const TEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
}

export function testStatusLabel(s: string): string {
  return TEST_STATUS_LABELS[s] ?? s
}

export function testStatusTone(s: string): BadgeTone {
  switch (s) {
    case 'PENDING':
      return 'warning'
    case 'IN_PROGRESS':
      return 'info'
    case 'COMPLETED':
      return 'success'
    case 'CANCELLED':
      return 'danger'
    default:
      return 'neutral'
  }
}

export const RESULT_STATE_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  VERIFIED: 'Verified',
  APPROVED: 'Approved'
}

export function resultStateLabel(s: string): string {
  return RESULT_STATE_LABELS[s] ?? s
}

export function resultStateTone(s: string): BadgeTone {
  switch (s) {
    case 'VERIFIED':
      return 'info'
    case 'APPROVED':
      return 'success'
    default:
      return 'neutral'
  }
}

export const SAMPLE_STATUS_LABELS: Record<string, string> = {
  NOT_COLLECTED: 'Not collected',
  COLLECTED: 'Collected',
  RECEIVED: 'Received',
  REJECTED: 'Rejected',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed'
}

export function sampleStatusLabel(s: string): string {
  return SAMPLE_STATUS_LABELS[s] ?? s
}

export function sampleStatusTone(s: string): BadgeTone {
  switch (s) {
    case 'COLLECTED':
    case 'RECEIVED':
      return 'info'
    case 'PROCESSING':
      return 'warning'
    case 'COMPLETED':
      return 'success'
    case 'REJECTED':
      return 'danger'
    default:
      return 'neutral'
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDaysStr(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
