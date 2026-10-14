# OMNI v2 local inactive harness

> Superseded on 09/10/2026 by the executable test workflows in
> `n8n/omnichannel-test/`. These files are kept only as history.

These exports are local contract fixtures for the first implementation of
Lote 2. They are not copies of production workflows and must not be imported,
activated or connected without a later approval gate.

Guarantees in this directory:

- every workflow has `active: false`;
- only `Manual Trigger` and `Code` nodes are used;
- no credential block, URL, webhook, provider request, model call, Supabase
  client or Redis client is present;
- all values identify synthetic companies or fake records;
- the fake provider sender returns `suppressed_observe_only` and cannot reach
  a provider;
- brains, tools, reminders and follow-ups are represented only by contract
  boundaries, not embedded implementations;
- context and brain fixtures preserve scope/call and captured-state correlation
  fields required by the local contracts;
- Asteric is not part of this harness.

All contract payloads are provisional until compared with the workflows that
are actually published in n8n.

## Rules represented (08/10/2026)

- The company post-appointment policy comes from the central store
  (`Omnichannel Policy Fake`); it is the same for every channel and applies
  only to the conversation where the appointment happened.
- With the pause enabled, only the single tool-bound confirmation enters the
  plan; with it disabled, all actions continue. Other blocks always apply.
- The buffer keeps the sliding debounce, persists before buffering, elects
  the owner by lead sequence and claims atomically, one batch per
  conversation.
- A newer lead message discards the unsent remainder and reprocesses the
  batch; sent actions and executed tool effects are never repeated.
- Every gate decision still ends `observe_only` in this harness.

## Miranda capability mapping

| Capability | Local component |
| --- | --- |
| Meta and Z-API event normalization | `adapter-ingress-fake-v1.inactive.json` |
| Trusted tenant/account resolution | `resolve-scope-fake-v1.inactive.json` |
| Contact, authorship and message persistence | `ingest-fake-v1.inactive.json` |
| Independent pauses and state versions | `state-command-v1.inactive.json` |
| Shared context agent configuration | `context-config-fake-v1.inactive.json` |
| Shared context output | `context-agent-v1.inactive.json` |
| Audio, image, PDF and video branches | `media-normalize-fake-v1.inactive.json` |
| Scoped history and buffering | `buffer-context-v1.inactive.json` |
| Private brain boundary | `invoke-brain-fake-v1.inactive.json` |
| Tool events, handoff and appointment rules | `apply-brain-result-v1.inactive.json` plus policy fixtures |
| Per-action permission and ordered delivery | `delivery-gate-v1.inactive.json` |
| Provider output | `provider-send-fake-v1.inactive.json` (always suppressed) |
| Expiry, resume and reconciliation | `expiry-resume-v1.inactive.json` and `recovery-v1.inactive.json` |

The TypeScript implementation under `lib/omnichannel/` is the executable
local reference. These JSON files visualize boundaries only and intentionally
contain no service integration.
