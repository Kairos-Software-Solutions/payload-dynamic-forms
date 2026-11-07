import type { EmailAdapter, SendEmailOptions } from 'payload'

/** Every message the dev app "sends", in order. Tests read and clear it. */
export const outbox: SendEmailOptions[] = []

/** Set `fail` to make the adapter throw (tests of failed delivery). */
export const emailControl: { fail: false | string } = { fail: false }

/** Records messages in memory instead of sending them. */
export const testEmailAdapter: EmailAdapter<void> = () => ({
  name: 'recording-email-adapter',
  defaultFromAddress: 'forms@example.com',
  defaultFromName: 'Forms dev app',
  sendEmail: async (message) => {
    if (emailControl.fail) {
      throw new Error(emailControl.fail)
    }
    outbox.push(message)
  },
})
