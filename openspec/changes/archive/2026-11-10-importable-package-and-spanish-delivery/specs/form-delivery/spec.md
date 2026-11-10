## ADDED Requirements

### Requirement: Emails in the reader's language
An email output's subject and body SHALL be localized. A visitor copy SHALL be written from the form read in the submission's locale, a team email from the form read in the app's default locale: subject, body, row and choice labels, Yes/No and form title. An empty translation SHALL take the default locale's words through Payload's fallback. Resend SHALL use the stored locale. `beforeEmail` SHALL get the locale used. Apps without localization SHALL behave as in 0.2.0.

#### Scenario: Subject and body are per language
- **WHEN** the plugin config is built
- **THEN** the forms collection's email row fields `subject` and `body` have `localized: true`, and no other field of the email row (label, kind, enabled, to, visitor field, cc, bcc, from, reply-to field) has it
- **CHECK** tests/plugin-config.test.ts › "email subject and body are localized"

#### Scenario: Subject and body live in the locales table
- **WHEN** the dev app (locales `en` and `es`) boots
- **THEN** `payload.db.tables` has `custom_forms_delivery_emails_locales` with `subject` and `body` columns, and `custom_forms_delivery_emails` has neither
- **CHECK** tests/int/email-locale.int.test.ts › "email subject and body live in the locales table"

#### Scenario: Visitor copy in the submission's language
- **WHEN** a form has a team output and a visitor copy, English and Spanish title, labels, yes word, subject `Thanks, {{name}}` / `Gracias, {{name}}` and body `{{*}}`, and a visitor posts to `submit/<slug>?locale=es` with the box ticked
- **THEN** the visitor copy's subject is `Gracias, Ana`, its text has the Spanish labels and the Spanish yes word, and the submission stores locale `es`
- **CHECK** tests/int/email-locale.int.test.ts › "visitor copy is written in the submission's language"

#### Scenario: Team email in the default language
- **WHEN** the same Spanish submission is delivered
- **THEN** the team email's subject, `{{formTitle}}`, labels and yes word are the English ones, and its answers are the visitor's
- **CHECK** tests/int/email-locale.int.test.ts › "team email is written in the default language"

#### Scenario: Empty translation falls back
- **WHEN** the visitor copy's Spanish subject is saved as an empty string and its Spanish body was never set, and a Spanish submission is delivered
- **THEN** the visitor copy uses the English subject and English body, filled with the Spanish labels
- **CHECK** tests/int/email-locale.int.test.ts › "empty spanish email words fall back to the default language"

#### Scenario: Resend keeps each email's language
- **WHEN** an admin resends a Spanish submission whose two emails failed
- **THEN** the resent visitor copy is in Spanish and the resent team email in English
- **CHECK** tests/int/email-locale.int.test.ts › "resend writes each email in the same language"

#### Scenario: beforeEmail gets the locale
- **WHEN** `beforeEmail` records its second argument for a Spanish submission with a team email and a visitor copy
- **THEN** it gets `locale` `es` with the Spanish form title for the visitor copy and `locale` `en` with the English title for the team email
- **CHECK** tests/int/email-locale.int.test.ts › "beforeEmail receives the locale each email was written in"

#### Scenario: App without localization sends as before
- **WHEN** the dev app runs with `localization: false` and a form with a team output and a visitor copy is submitted
- **THEN** both emails use the saved subject and body, the submission stores no locale, `beforeEmail` gets no locale, and `custom_forms_delivery_emails` holds `subject` and `body` with no `_locales` table for it
- **CHECK** tests/int/email-locale.int.test.ts › "an app without localization sends as before"
