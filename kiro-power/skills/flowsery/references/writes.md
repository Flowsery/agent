# Writes

Five tools change data. None of them charges a customer, moves money or touches a
payment provider. Each takes `websiteId` or `domain` like the report tools.

## Issue status (`update_issue_status`)

Takes `issueId` (from `list_issues`) and `status`. Reversible: only the status changes,
and any status can be set again later. Set it only after the user says which state they
mean:

| Status | Meaning |
|--------|---------|
| `open` | Needs attention |
| `in_progress` | Someone is on it |
| `resolved` | The bug is fixed |
| `suspended` | Not a real problem; hidden from the default `list_issues` result |

Issues cannot be deleted through the server.

## Recording (`track_goal`, `track_payment`)

Ask for a "yes" first, showing the website and exactly what will be recorded.

`track_goal` takes `name`, plus optional `visitorUid`, `sessionUid`, `timezone` and
`metadata`.

- The goal is created on first use; nothing has to be created beforehand.
- Names are lowercase letters, digits, underscores and hyphens, max 64 characters
  (`newsletter_signup`, `add-to-cart`).
- `visitorUid` is the `_fs_vid` cookie value of a visitor the tracking script has seen.
  Omit it for an anonymous completion.
- `sessionUid` is the `_fs_sid` cookie value. It ties the completion to that session;
  without it a server-side call uses the visitor's latest active session.
- `timezone` is the visitor's IANA timezone (`Europe/Berlin`). It helps place the visitor
  in a country when the call comes from a server or proxy.
- `metadata` holds up to 10 string key-value pairs; more fails with a 400.
- Each call appends one completion. Calling it twice counts the goal twice.
- The completion is written asynchronously and shows up in `get_goals` shortly after.

`track_payment` takes `amount` (major units, 29.99), `currency` (`USD`, `EUR`) and
`transactionId`, plus optional `visitorUid`, `sessionUid`, `timezone`, `email`, `name`,
`customerId`, `isRenewal`, `isRefund`, `timestamp` (ISO 8601, for backfilling; defaults to
now), `customerIp` and `customerUserAgent`.

- Skip it when the site's payment provider (Stripe, LemonSqueezy, Polar and others) is
  already connected, or the revenue is counted twice.
- `transactionId` must be unique; a repeated one is rejected, not deduplicated.
- A new payment also records a `payment` goal completion, or `free_trial` when `amount` is
  0. `isRenewal: true` counts the revenue without recording that goal.
- Attribution looks up a known visitor by `visitorUid`, `customerId` or `email`. With no
  match the revenue is kept but its source shows as Unknown.
- `customerIp` and `customerUserAgent` (max 1024 characters) are the buyer's IP and
  User-Agent at checkout, for a server-side call that cannot match the payment to a
  visitor. Flowsery keeps only the country, browser, OS and device it resolves from them.
  Send them only when the user supplied them.
- To record a refund that already happened, call it with `isRefund: true`, the original
  `transactionId` and the refunded `amount`. That updates the existing payment instead of
  adding a row. Do not delete the payment.
- Send only the fields the task needs. Add `email`, `name` or `customerId` only when the
  user supplied them and wants the payment attributed.

## Erasing (`delete_goals`, `delete_payments`)

Permanent. Deleted payments disappear from every report and visitor profile.

- `delete_goals` filters on `visitorId`, `name`, `startAt`, `endAt`. It removes
  completions only; the goal itself still appears in `get_goals`.
- `delete_payments` filters on `transactionId`, `visitorId`, `startAt`, `endAt`.
- Filters combine with AND, and at least one is required. `startAt` and `endAt` are
  independent, so one bound alone is allowed. `visitorId` is the id `get_visitor` takes.

Before calling either:

1. Restate the website, every filter, and the date range in one message. Without a date
   range the delete covers the whole history; say so.
2. If you can, count first (`get_goals`, or the revenue in `get_overview` for the same
   window) so the user sees what will go.
3. Wait for a "yes" that answers that restatement. A "yes" to an earlier, different
   restatement does not count.
4. Report how many rows were deleted (`deleted` in the response).

Treat "clean up", "fix" or "remove" data as a delete request and confirm it the same way.
