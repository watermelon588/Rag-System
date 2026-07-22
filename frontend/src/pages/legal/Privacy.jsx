import LegalLayout, { Section, Bullets } from './LegalLayout';

const UPDATED = '23 July 2026';
const CONTACT = 'maityrohit021@gmail.com';

export default function Privacy() {
    return (
        <LegalLayout title="Privacy Policy" updated={UPDATED}>
            <Section heading="1. Overview">
                <p>
                    This policy explains what Neuron collects, why, and what control you have. We
                    collect the minimum needed to run the Service — we do not sell your data and we
                    do not use advertising trackers.
                </p>
            </Section>

            <Section heading="2. What we collect">
                <Bullets items={[
                    'Account data — your email address, display name, optional bio and optional profile photo.',
                    'Authentication data — a hashed password (PBKDF2-SHA256 with a per-user salt). Your plaintext password is never stored.',
                    'Search history — the interpreted text of searches you run while signed in, along with the modality used and how many results came back.',
                    'Saved results — any search result you explicitly bookmark.',
                    'Uploaded content — documents you upload for chat, and the media (images, audio, video) you attach to a search.',
                    'Chat data — your questions and the generated answers, so conversations persist.',
                    'Feedback — the message you submit and, optionally, an email to reply to.',
                    'Technical logs — request IDs, timestamps and error diagnostics. Sensitive fields are redacted.',
                ]} />
            </Section>

            <Section heading="3. How we use it">
                <Bullets items={[
                    'To provide the core features: search, document chat, history, saved results and your profile.',
                    'To authenticate you and keep your session secure.',
                    'To diagnose faults, prevent abuse and enforce rate limits.',
                    'To respond to feedback you send us.',
                ]} />
                <p>
                    We do not use your uploaded documents or media to train models, and we do not
                    sell or rent personal data to anyone.
                </p>
            </Section>

            <Section heading="4. Media & search inputs">
                <p>
                    Media you attach to a search is processed to build the query — audio is
                    transcribed, images are described and converted into an embedding vector, and
                    video frames are sampled. Query text derived from your input is sent to our
                    third-party search provider in order to fetch results.
                </p>
                <p>
                    Do not upload confidential material you are not permitted to share with the
                    third-party processors listed below.
                </p>
            </Section>

            <Section heading="5. Third parties we share data with">
                <Bullets items={[
                    'Search provider (Serper) — receives your interpreted query text to return live web results.',
                    'Language-model provider (Groq, when configured) — receives query text and document excerpts to generate answers. If no key is configured, a local model is used instead and nothing leaves the server.',
                    'Cloudinary — stores your profile photo if you upload one. The image is sent directly from your browser to Cloudinary.',
                    'MongoDB host — stores your account, history, saved results, documents and chats.',
                    'Email (SMTP) — used only to deliver feedback messages you submit.',
                ]} />
                <p>
                    Each third party processes data under its own privacy policy. We share only
                    what is necessary for the relevant feature to work.
                </p>
            </Section>

            <Section heading="6. Cookies">
                <p>
                    We use two strictly-necessary cookies to keep you signed in: a short-lived
                    access token and a refresh token. Both are <strong>httpOnly</strong>, so page
                    JavaScript cannot read them, and both carry a <code>SameSite</code> attribute.
                    We set no advertising or analytics cookies, so there is no consent banner to
                    dismiss.
                </p>
            </Section>

            <Section heading="7. Security">
                <Bullets items={[
                    'Passwords hashed with PBKDF2-SHA256 and per-user salts; verification is constant-time.',
                    'Session tokens delivered as httpOnly cookies, which resists theft via cross-site scripting.',
                    'Input is sanitised on the server and responses carry a strict Content-Security-Policy.',
                    'Uploads are validated by extension and magic bytes, size-capped, and stored under content-hash names.',
                    'Every document, chat and saved result is scoped to its owner and checked on each request.',
                ]} />
                <p>
                    No system is perfectly secure. Please avoid uploading highly sensitive
                    material to a demonstration service.
                </p>
            </Section>

            <Section heading="8. Retention">
                <p>
                    Account data is kept until you ask us to delete it. Documents, chats, saved
                    results and history are kept until you delete them — history can be cleared,
                    and saved results and documents removed, from your profile at any time.
                    Deleting a document also removes its extracted chunks and vectors.
                </p>
            </Section>

            <Section heading="9. Your rights">
                <p>
                    Depending on where you live, you may have the right to access, correct, export
                    or delete your personal data, and to object to certain processing. You can edit
                    your profile and clear your history in-app; for anything else, contact us and
                    we will action reasonable requests.
                </p>
            </Section>

            <Section heading="10. Children">
                <p>
                    The Service is not directed at children under 13, and we do not knowingly
                    collect their personal data. If you believe a child has given us data, contact
                    us and we will delete it.
                </p>
            </Section>

            <Section heading="11. Contact">
                <p>
                    Privacy questions or deletion requests:{' '}
                    <a href={`mailto:${CONTACT}`} style={{ color: 'var(--accent-text)' }}>{CONTACT}</a>.
                </p>
            </Section>
        </LegalLayout>
    );
}
