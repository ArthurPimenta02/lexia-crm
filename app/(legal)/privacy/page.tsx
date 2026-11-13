import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy · Lexia AI" };
export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="data">Last updated: November 13, 2026</p>

      <p>
        This Privacy Policy explains how Lexia AI (&quot;Lexia&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses, stores and
        deletes personal data when businesses use the Lexia platform (app.uselexia.app) and our AI agents to answer
        their customers on Instagram, Facebook Messenger and WhatsApp, and when people visit our website
        (uselexia.app).
      </p>

      <h2>1. Who we are</h2>
      <p>
        Lexia AI provides AI customer-service agents and a dashboard to businesses (our &quot;Clients&quot;), such as spas,
        clinics and auto-detailing studios. For messages exchanged between a Client and its own customers, the Client
        is the data controller and Lexia acts as a data processor on the Client&apos;s behalf. For data about our own
        Clients and website visitors, Lexia is the controller. Contact:{" "}
        <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a>.
      </p>

      <h2>2. Data we receive from Meta platforms</h2>
      <p>When a Client connects its Instagram professional account, Facebook Page or WhatsApp Business number to Lexia, we receive through Meta&apos;s official APIs:</p>
      <ul>
        <li>The Client&apos;s account identifiers (Instagram account ID, username, Page ID, WhatsApp phone number ID) and an access token issued by Meta.</li>
        <li>Messages that people send to the Client&apos;s account (text, audio, images, video, documents), the replies sent by the Client or by the Lexia agent, and message metadata (timestamps, message IDs).</li>
        <li>The sender&apos;s public profile name, username and scoped user ID, as provided by Meta.</li>
        <li>When a conversation starts from an ad, the ad referral information provided by Meta (such as ad ID and click ID).</li>
      </ul>

      <h2>3. How we use this data</h2>
      <ul>
        <li>To read incoming messages and reply to them on the Client&apos;s behalf, using AI, according to the Client&apos;s instructions (answering questions, sharing prices and availability, booking appointments).</li>
        <li>To show the conversations, contacts, bookings and results to the Client in the Lexia dashboard, and to let the Client&apos;s team take over a conversation.</li>
        <li>To send the Client&apos;s own conversion events (e.g. a lead booked or attended) back to Meta, when the Client enables it, so the Client can measure its own ads.</li>
        <li>To keep the service secure, prevent abuse and fix errors.</li>
      </ul>
      <p>
        We do not sell personal data, we do not use data received from Meta for advertising to anyone other than the
        Client it belongs to, and we do not use one Client&apos;s data to serve another Client.
      </p>

      <h2>4. Service providers</h2>
      <p>
        We use trusted providers to run the service: cloud hosting and databases (Vercel, Supabase, our own virtual
        server), AI model providers (such as OpenAI) to understand messages and write replies, Google Calendar when a
        Client uses it for bookings, and Meta&apos;s APIs to receive and send messages. Providers process data only to
        provide their service to us, under confidentiality and data-protection obligations. Some providers are located
        outside the European Economic Area; in that case we rely on appropriate safeguards such as Standard Contractual
        Clauses.
      </p>

      <h2>5. Legal basis</h2>
      <p>
        We process data to perform our contract with Clients, on the basis of our and our Clients&apos; legitimate
        interest in answering customer enquiries, on consent where required, and to comply with legal obligations.
      </p>

      <h2>6. Retention</h2>
      <p>
        Conversation data is kept while the Client uses Lexia, so the agent has context and the Client keeps its
        history. When a Client disconnects an account or ends its contract, its access tokens are revoked immediately
        and its conversation data is deleted within 30 days, unless the law requires us to keep it longer. Website
        demo-request data is kept for up to 24 months.
      </p>

      <h2>7. Your rights and data deletion</h2>
      <p>
        You can ask to access, correct or delete your personal data, restrict or object to processing, or withdraw
        consent. See our <a href="/data-deletion">Data Deletion instructions</a>, or write to{" "}
        <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a>. If you are a customer of one of our Clients,
        you can also contact that business directly. You may lodge a complaint with your local data protection
        authority.
      </p>

      <h2>8. Security</h2>
      <p>
        Access tokens and data are stored in access-controlled databases, transmitted over encrypted connections
        (HTTPS) and accessible only to authorised staff and the Client&apos;s own users.
      </p>

      <h2>9. Website and cookies</h2>
      <p>
        On uselexia.app we collect the details you submit in our demo form and basic technical and usage data
        (browser, language, approximate location, pages visited) through cookies and analytics, which you can accept
        or reject in the cookie banner.
      </p>

      <h2>10. Changes</h2>
      <p>We may update this policy. The date at the top shows the latest version.</p>

      <h2>11. Contact</h2>
      <p>
        Lexia AI — <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a>
      </p>
    </>
  );
}
