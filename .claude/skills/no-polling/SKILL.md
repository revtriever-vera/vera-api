---
name: no-polling
description: >
  Work triggered by a fact or a deadline, never by a periodic scan, in vera-api. Use when creating
  or changing a job, queue, cron, command, scheduler, integration sync (Pluggy, market data) or
  event handler, and when reviewing any tick that "looks at everything to find work".
---

# No polling — vera-api

**Cost proportional to what changed, not to the size of the base.** A scan that looks cheap with a
few users grows with every account, connection and transaction; an event grows with what changed.
The first slow tick usually shows up as a worker pinned at high CPU with nothing happening, and by
then the scan is wired into half the module.

The design question is **what triggers this work?** Only four answers are accepted:

| What triggers it                       | Mechanism                                                                |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Something changed                      | an event published at the point of change, carrying the ids that changed |
| A deadline arrived                     | a delayed job (BullMQ `delay`), scheduled when the deadline is born      |
| An external system changed, no webhook | incremental sync with a watermark                                        |
| An event may have been lost            | a **daily** safety net, ids only, cheap indexed query                    |

"Every N minutes, find what needs work" is not an answer. At rest (nothing changed, no deadline
passed) the cost must be **zero**.

This skill narrows `queues-and-scheduling`: commands stay the only cron mechanism, but a sweep is
justified by section 7 below, not by convenience.

## 1. A deadline becomes a delayed job, not a tick that waits for the clock

A tick every 5 minutes that re-evaluates every open item just to wait for a time to pass pays for
every item on every tick. Schedule the moment instead, when the deadline is born:

```typescript
// before: command every 5 min -> job per company -> evaluate every open item
// after: when the item opens, schedule one delayed job with a deterministic jobId
await this.publisher.publish(QUEUES.reminders, MESSAGE_TYPES.reminderDue, payload, {
    jobId: `reminder-due-${reminderId}-${dueAt.getTime()}`,
    delayMs: Math.max(0, dueAt.getTime() - now.getTime())
});
```

- `jobId` by **what makes the work unique** (the thing and the moment). Rescheduling the same
  deadline does not duplicate; a new deadline has another id.
- The job **re-reads the state when it runs** and does nothing if the item vanished, closed or moved.
  The deadline is only the trigger; the truth is in the database.
- A deadline that stops applying is **cancelled** (only waiting/delayed jobs can be removed).
- **Existing stock needs a backfill at boot**, idempotent through the same `jobId`; otherwise what
  was already open at deploy time never gets a job.

## 2. A change becomes an event scoped to what changed

If the end of a sync recompiles **every** open item of the company, the cost is the whole base for a
sync that changed two rows.

```typescript
// before: the end-of-run event triggers "everything"
await this.states.onSyncFinished(envelope.payload.companyId);   // loads every open id

// after: each page the sync writes publishes the ids it touched
await this.states.onItemsSynced(envelope.payload.companyId, envelope.payload.itemIds);
```

- The payload carries **the ids that changed** (the queues skill already asks for ids, not
  entities). A "finished" event serves whoever needs to know it finished; it is **not** a trigger to
  reprocess the company.
- Before publishing, ask: _with 1 change, how many items does this handler touch?_ If the answer is
  "the company's whole base", the scope is wrong even if the event is right.
- Publish **the fact** (`transactions.categorized`), without comparing before and after. The source
  delta already carries only what changed, and the consumer re-evaluates only that item.
- **Debounce by time window** in the `jobId` when the fact arrives in bursts: one job per company
  per window, one per item per minute.
- What depends only on the clock (a price that ages, a daily snapshot) lives in a **bounded**
  recompute routine (a limit per run, only stale state), never on the event path.

## 3. Permanent failure is a terminal state

A job that asks a provider for the same thing every tick, and is refused every time, repeats
forever when the refusal does not change the state: the row stays "pending".

- **Permanent** (invalid credentials, invalid payload, a business rule that cannot be met): record
  the terminal state with the reason (`markSkipped(id, 'credentials_rejected')`) and the row leaves
  every query.
- **Transient** (provider down): the retry is the **job's own backoff** (throw so BullMQ tries
  again), not the next tick. When attempts run out, the failure handler records the terminal state.
- Every "what is left to do" query must exclude the terminal state. If it only has
  `status = 'pending'` and the failure never leaves `pending`, it is an infinite loop.

## 4. External integration: incremental with a watermark

Re-reading a long window from the provider on every run is mostly repeated work.

- Ask the provider only for what changed since last time (a cursor, a sync token, an
  `updatedSince`) and store the **watermark** per connection. A long horizon only on the first sync.
- Prefer the provider's push/webhook when it exists. If there must be polling, it asks only for the
  delta.
- With no watermark yet, the minimum is **not reprocessing what did not change**: one batch lookup
  (`externalId IN (...)`) per connection instead of one per item, and skipping the write when the
  stored row is identical. Note the debt in the module's `docs/` if the incremental sync is deferred.

## 5. Costly calls only when the input changes

A call that is slow, paid or rate-limited (an AI call, a provider quota) must not repeat for an
input that did not change.

- Compute a **hash of the input** and only call when it changed **and** something is still
  unresolved. Put the version in the `jobId` (`<company>-<object>-<version>`).
- "Tried and it did not resolve" is a result, not a pending item: it is no reason to ask again.
- Requests that accumulate go out delayed, one per version, not one per sync.

## 6. Durable publication: redelivery must redo the work

Publishing after the commit loses the request if the queue refuses or the process dies in between.
With no sweep to repair it, the request vanishes until the next change.

- **Comparing the state before and after the write** ("did it change?") is a trap: if the publish
  fails and the job is redelivered, before == after and the request is lost. Compare with the
  **last version for which a request was really published**, stored **after** the successful publish.
- Or **publish before writing**: a failed publish aborts the job without writing and the redelivery
  sees the old world and publishes again; a write that fails after the publish only repeats a job
  deduplicated by `jobId`. Valid only when the consumer **re-reads the state** and the `jobId` dedup
  covers the duplicate.
- If losing the message costs money or writes to an external system, the way is the transactional
  **outbox** (the queues skill already fixes that trigger), not "publish afterwards".

## 7. Safety net: daily, cheap, and only when there is a hole

If an event can be lost, the answer is a **once-a-day** check that selects only ids with an indexed
query, not a 5-minute tick. A heavy reconcile query (joins, regex, `EXISTS` over every row) that
returns 0-2 rows does not belong in a short tick: move it to a daily run over indexed columns.

- Before creating the net, try the **missing fact**: if the only case without an event is "X later
  gained Y", publish an event when Y arrives.
- A metric or gauge that only feeds a dashboard does not justify a scan: compute it once a day.

## Checklist when creating or reviewing a job, queue, cron, sync or handler

1. Which **fact** or **deadline** triggers it? If the answer is "the N-minute clock", stop.
2. With 1 change, how many items does it touch? At rest, how many queries? (Expected: 1 and 0.)
3. Does the payload carry the ids that changed, and does the handler touch only them?
4. Does a permanent failure have a terminal state that leaves the queries? Does a transient one use
   the job's backoff?
5. If the publish fails and the job is redelivered, is the request redone? Deterministic `jobId`?
6. Does the AI or costly external call have a hash or watermark of its input?
7. Was there stock before the deploy? Idempotent backfill at boot.
8. Removing a command: the registrar deletes the orphan scheduler at boot, and in-flight jobs of the
   removed type hit the missing-handler path. Say so in the PR.
9. Replaced or removed a handler or module? Boot the `AppModule` in an integration spec: a missing
   export in a module can take down the whole boot and every spec that depends on it.
10. In the PR, a section **"What stops happening on its own"**: what the scan covered for free and
    now depends on an event or the daily net.

When a tick really is the answer (few cases: the daily net, a bounded recompute of stale state),
say in the PR why none of the four answers in the table fits.
