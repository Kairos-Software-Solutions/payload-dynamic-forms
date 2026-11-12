import type { Payload, PayloadRequest } from 'payload'

import type { Answers, SnapshotRow, SubmissionStatus } from '../shared/types.js'

import { type LogEntry, runDeliveries, statusFromLog } from '../delivery/run.js'
import { isTimeZone } from '../shared/dates.js'
import { getPluginOptions, loadFormById, pluginLocale } from './forms.js'

export type SubmissionDoc = {
  answers?: Answers | null
  attachments?: Array<{ id: number | string } | number | string> | null
  deliveryLog?: LogEntry[] | null
  form?: { id: number | string } | null | number | string
  id: number | string
  metadata?: { locale?: null | string; timeZone?: null | string } | null
  snapshot?: null | SnapshotRow[]
}

/**
 * Runs again the outputs whose last try failed and that still exist on the form. Outputs removed
 * since get a "skipped" entry. Returns the full new log and status (the caller saves them).
 */
export async function resendFailedDeliveries(
  payload: Payload,
  submission: SubmissionDoc,
  req: PayloadRequest,
): Promise<{ added: LogEntry[]; log: LogEntry[]; status: SubmissionStatus }> {
  const options = getPluginOptions(payload)
  const log = (submission.deliveryLog || []).map((entry) => {
    const { id: _id, ...rest } = entry as { id?: string } & LogEntry
    return rest as LogEntry
  })
  const formId = typeof submission.form === 'object' && submission.form ? submission.form.id : submission.form
  const locale = pluginLocale(payload, submission.metadata?.locale)
  // The zone recorded at the submit, so a resent message or webhook shows the same clock.
  const recorded = submission.metadata?.timeZone
  const recordedTimeZone = isTimeZone(recorded) ? recorded : undefined
  const loaded = formId != null ? await loadFormById(payload, formId, { locale, req }) : null
  const last = new Map<string, LogEntry>()
  for (const entry of log) {
    if (entry.outputId) {
      last.set(entry.outputId, entry)
    }
  }
  const failed = [...last.values()].filter((entry) => entry.result === 'failed')
  if (!failed.length) {
    return { added: [], log, status: statusFromLog(log) }
  }
  const existing = new Set<string>(
    loaded
      ? [...loaded.delivery.emails, ...loaded.delivery.webhooks]
          .filter((o) => o.enabled !== false && o.id)
          .map((o) => String(o.id))
      : [],
  )
  const added: LogEntry[] = []
  const rerun = new Set<string>()
  for (const entry of failed) {
    if (existing.has(entry.outputId!)) {
      rerun.add(entry.outputId!)
    } else {
      added.push({
        at: new Date().toISOString(),
        error: 'This output is no longer on the form (or is switched off); not sent again.',
        kind: entry.kind,
        label: entry.label,
        outputId: entry.outputId,
        result: 'skipped',
        target: entry.target,
        tries: 0,
      })
    }
  }
  if (loaded && rerun.size) {
    const attachments = (submission.attachments || []).map((a) => (typeof a === 'object' ? a.id : a))
    added.push(
      ...(await runDeliveries(
        {
          answers: submission.answers || {},
          attachments: attachments.map((id) => ({ id, fieldKey: '', filename: '' })),
          delivery: loaded.delivery,
          form: loaded.form,
          locale,
          options,
          payload,
          recordedTimeZone,
          req,
          snapshot: submission.snapshot || [],
          submissionId: submission.id,
          timeZone: recordedTimeZone ?? options.timezone,
        },
        rerun,
      )),
    )
  }
  const next = [...log, ...added]
  return { added, log: next, status: statusFromLog(next) }
}