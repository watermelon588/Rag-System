import LegalLayout, { Section, Bullets } from './LegalLayout';

const UPDATED = '23 July 2026';
const CONTACT = 'maityrohit021@gmail.com';

export default function Terms() {
    return (
        <LegalLayout title="Terms & Conditions" updated={UPDATED}>
            <Section heading="1. Acceptance">
                <p>
                    By creating an account or using Neuron (“the Service”) you agree to these
                    Terms. If you do not agree, please do not use the Service. Neuron is an
                    independent project provided for research and demonstration purposes.
                </p>
            </Section>

            <Section heading="2. What Neuron does">
                <p>
                    Neuron is a multimodal retrieval platform. It accepts text, images, audio and
                    video, fuses them into a single semantic query, retrieves live results from
                    third-party search providers, and lets you upload documents to ask questions
                    against them.
                </p>
                <p>
                    Results are produced by automated systems and third-party indexes. They may be
                    incomplete, outdated or wrong. Do not rely on them for medical, legal,
                    financial or other consequential decisions.
                </p>
            </Section>

            <Section heading="3. Your account">
                <Bullets items={[
                    'You are responsible for keeping your password secure and for all activity under your account.',
                    'Provide accurate registration details and keep them current.',
                    'You must be old enough to form a binding contract in your jurisdiction.',
                    'Tell us promptly at ' + CONTACT + ' if you suspect unauthorised access.',
                ]} />
            </Section>

            <Section heading="4. Content you upload">
                <p>
                    You keep ownership of everything you upload. You grant us only the limited
                    permission needed to operate the Service — to store, process, index and display
                    your content back to you.
                </p>
                <p>You confirm that you have the right to upload what you submit, and that it does not:</p>
                <Bullets items={[
                    'infringe anyone’s copyright, trademark, privacy or other rights;',
                    'contain malware, or attempt to attack or overload the Service;',
                    'contain unlawful material, or content depicting the abuse of any person;',
                    'contain other people’s personal or confidential data without a lawful basis.',
                ]} />
            </Section>

            <Section heading="5. Acceptable use">
                <Bullets items={[
                    'Do not attempt to gain unauthorised access to the Service, other accounts, or its infrastructure.',
                    'Do not scrape, resell or redistribute results at scale, or use the Service to build a competing index.',
                    'Do not use automated systems that place unreasonable load on the Service.',
                    'Do not circumvent rate limits, upload caps or other technical restrictions.',
                ]} />
            </Section>

            <Section heading="6. Third-party services">
                <p>
                    Neuron depends on third parties to function — including a web search provider,
                    a hosted language-model provider, an image storage provider and a database
                    host. Your use of the Service also involves their processing. Links and results
                    that point to external sites are not endorsements, and we are not responsible
                    for third-party content.
                </p>
            </Section>

            <Section heading="7. Availability & changes">
                <p>
                    The Service is provided on a best-effort basis and may be modified, suspended
                    or discontinued at any time without notice. Features may change, and stored
                    data may be removed when a feature is retired.
                </p>
            </Section>

            <Section heading="8. Termination">
                <p>
                    You may stop using the Service and request deletion of your account at any
                    time. We may suspend or terminate access if these Terms are breached, or if
                    required to protect the Service or other users.
                </p>
            </Section>

            <Section heading="9. Disclaimer & liability">
                <p>
                    The Service is provided “as is” and “as available”, without warranties of any
                    kind, whether express or implied, including fitness for a particular purpose
                    and non-infringement.
                </p>
                <p>
                    To the maximum extent permitted by law, we are not liable for any indirect,
                    incidental or consequential damages, nor for any loss of data, profits or
                    revenue arising from your use of the Service.
                </p>
            </Section>

            <Section heading="10. Changes to these Terms">
                <p>
                    We may update these Terms. Material changes will be reflected by the “last
                    updated” date above. Continuing to use the Service after a change means you
                    accept the revised Terms.
                </p>
            </Section>

            <Section heading="11. Contact">
                <p>
                    Questions about these Terms: <a href={`mailto:${CONTACT}`} style={{ color: 'var(--accent-text)' }}>{CONTACT}</a>.
                </p>
            </Section>
        </LegalLayout>
    );
}
