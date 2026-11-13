import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data Deletion · Lexia AI" };
export const dynamic = "force-static";

export default function DataDeletionPage() {
  return (
    <>
      <h1>Data Deletion Instructions</h1>
      <p className="data">Last updated: November 13, 2026</p>

      <p>
        Lexia AI receives messages from Instagram, Facebook Messenger and WhatsApp only on behalf of the businesses that
        use our platform. You can ask us to delete your data at any time.
      </p>

      <h2>If you messaged a business that uses Lexia</h2>
      <ul>
        <li>
          Send an email to <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a> with the subject
          &quot;Data deletion&quot;, the name of the business you talked to, and your Instagram username, Facebook name
          or phone number.
        </li>
        <li>We confirm the request and delete your conversations, profile name and identifiers from Lexia within 30 days, and reply when it is done.</li>
        <li>You can also ask the business itself; it can request the deletion from us.</li>
      </ul>

      <h2>If you are a business that connected an account</h2>
      <ul>
        <li>
          Remove the Lexia app from your account (Instagram: Settings › Apps and websites; Facebook: Settings › Business
          integrations), or email <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a>.
        </li>
        <li>Your access tokens are revoked immediately and your conversation data is deleted within 30 days.</li>
      </ul>

      <p>
        Questions: <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a>. See also our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}
