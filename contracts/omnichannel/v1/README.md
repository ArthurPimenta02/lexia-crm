# Omnichannel v1 contracts

All contracts in this directory are **provisional**. They implement the local
boundary approved for Lote 2, but they have not yet been compared with the
currently published n8n brains, provider adapters, reminder workflows or
follow-up workflows.

The JSON Schemas intentionally contain `x-lexia-contract-status` and a
`$comment` describing the missing validation. Removing that marker requires a
separate compatibility review.

The local reference validates complete fixture payloads against these schemas,
including nested actions and domain events. Context results carry their full
scope, context-call ID and source message IDs. Brain results carry the captured
state, while appointment tool audits distinguish availability checks, creation
and cancellation and bind the returned appointment reference. Unknown schema
keywords fail closed instead of being ignored.

`crm-sync-event.schema.json` is the provisional bridge into the Frappe CRM.
It records one durable fact at a time and carries trusted scope, source
authority, workflow execution, ordering and idempotency data. Provider events
own message facts, attested tool results own appointments, workflow
executions own follow-up/reminder lifecycle, and CRM users own attendance and
manual resolution. Brain text cannot prove delivery or appointment creation.
Messages are recorded before expensive media work. A later
`message.enrichment.updated` event records transcription or image/PDF/video
processing, including failure, without replacing the original message or its
pause. CRM idempotency keys hash a canonical tuple instead of concatenating
free-form identifiers, so separators inside provider IDs cannot collide.

`crm-command.schema.json` is the provisional reverse bridge. It defines the
only six CRM commands accepted by the local candidate: start/end a manual
pause, resolve/resume a handoff, cancel an appointment, and record attendance
or no-show. Each command has a closed payload selected by `oneOf`; scope and
tenant are still re-resolved from the authenticated integration before an
effect. The real Frappe authentication transport remains an integration gate.

Outbound content supports text, image with an optional caption, and an opaque
audio `media_ref`. The reference is not a provider URL or credential. It keeps
follow-up media representable while asset resolution and provider capability
checks remain outside the local-only implementation.

O validador local confere os componentes de `date-time` antes de aceitar o
valor, sem depender da normalização de `Date.parse`: datas inexistentes e hora
`24` são rejeitadas, enquanto datas válidas com offset explícito são aceitas.
Erros no payload usam uma classe diferente de erros na própria definição do
schema. Recursos estruturais não suportados, como `$ref` recursivo, são
rejeitados no preflight e não podem ser convertidos em sucesso por `not`,
`anyOf` ou `oneOf`.

This correlation is not proof that a real tool executed. Authenticating the
tool result and mapping each published brain remain later integration gates.

Examples use only `empresa_sintetica_a`, `empresa_sintetica_b`, opaque IDs and
fake provider references. They are data fixtures, not deployable
configuration. No URL, credential or destination is present.

The master owns durable state and delivery permission. Brains, tools,
reminders and follow-ups communicate through these contracts but stay in
separate workflows and never receive a provider sending credential.

`workflow-test-request.schema.json` and `workflow-test-result.schema.json`
define the provisional test-only bridge from Frappe to inactive n8n
workflows. The request is restricted to synthetic `isolated_test` or `staging`
scope and `delivery_mode = simulate`; the result must state that no provider
send was attempted and correlate both the run and selected target.
