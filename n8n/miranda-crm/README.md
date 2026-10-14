# Miranda CRM bridge - inactive shadow design

This directory prepares the six current Miranda workflows to mirror structured
events into Frappe CRM. It does not contain an importable copy of those private
workflows and does not contain credentials, URLs, customer data or provider
destinations.

The only workflow export here is an inactive, simulated sink. It validates the
event boundary and returns `shadow_only`; it cannot contact Frappe or any other
service. `miranda-event-map.json` identifies the insertion points observed in
the read-only exports supplied on 09/10/2026.

## Authority hierarchy

1. Provider events own inbound messages, authorship, attribution and provider
   message identifiers.
2. Provider results own delivery confirmations.
3. Attested tool results own appointment confirmation and cancellation.
4. Workflow executions own context, follow-up and reminder lifecycle.
5. Validated brain results may request a handoff, but cannot prove delivery or
   appointment creation.
6. CRM users own attendance, handoff resolution and explicit resume commands.

All events carry the trusted environment, client, channel, account and
conversation scope. A message is recorded even while automation is paused.
Human intervention creates or renews its block before download, transcription
or model work. Media processing is a later enrichment event, so failure cannot
erase the original message or its pause.

## Safe integration order

1. Keep all current workflows as the only delivery owners.
2. Insert event builders into inactive workflow copies and call the fake sink.
3. Compare generated events with the contract and synthetic Frappe laboratory.
4. Replace the fake sink with a least-privilege laboratory credential and an
   approved URL held outside exports.
5. Run in shadow mode: failures are observable but never affect current sends.
6. Only after parity, move pause and delivery commands behind the shared gate.

`message.delivery.updated` is emitted only from a real provider result or a
reconciliation. A timeout becomes `delivery_unknown`; it is never interpreted
as a safe failure to resend.

