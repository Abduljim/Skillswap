import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <Link to="/" className="btn-ghost text-sm -ml-2 inline-flex">← Back to home</Link>
      <h1 className="font-display font-bold text-3xl md:text-4xl text-ink-900 mt-4">Terms of Service</h1>
      <p className="text-sm text-ink-500 mt-2">Last updated: September 2026</p>

      <div className="mt-8 space-y-8 text-sm text-ink-700 leading-relaxed">
        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">The service</h2>
          <p>
            SkillSwap is a skill-exchange platform that helps students find people who can teach a
            skill they want to learn, in exchange for a skill they can teach. Using SkillSwap means
            you agree to these terms.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Your account</h2>
          <p>
            You must be a current student or someone with a genuine skill to offer. Keep your login
            details safe. You are responsible for everything done with your account. If you believe
            your account has been compromised, reset your password or contact support.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Exchanges are between users</h2>
          <p>
            SkillSwap connects you with other users. We match people based on skills and
            availability, but the exchange itself, including meeting up, tutoring quality, and
            scheduling, is an arrangement between you and the other user. SkillSwap is not a
            tutoring agency and is not a party to your exchanges.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Rules of conduct</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Be respectful in every exchange, message, and review.</li>
            <li>Only claim skills you genuinely have and can teach.</li>
            <li>Do not spam, advertise, or send unwanted messages.</li>
            <li>Do not ask for or share sensitive personal or financial information.</li>
            <li>Do not attempt to sell services, goods, or solicit payment through SkillSwap.</li>
            <li>Do not use SkillSwap for anything illegal, including harassment or fraud.</li>
          </ul>
          <p className="mt-3">
            Breaking these rules can result in a warning, blocked messaging, or removal of your
            account.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Safety</h2>
          <p>
            Meet in a public place when exchanging in person. Tell someone you trust where you'll
            be. Never share your home address, bank details, or government IDs. We provide tools to
            block and report users, and we take harassment seriously.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Pro membership</h2>
          <p>
            Pro is an optional paid subscription. It removes limits on requests and unlocks
            cosmetic features. You can cancel at any time; you keep Pro until the end of the period
            you paid for. Refunds are handled according to your payment provider's policy.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Liability</h2>
          <p>
            We work hard to keep SkillSwap reliable and correct, but we provide the service "as is".
            To the maximum extent allowed by law, we are not liable for losses or damage arising
            from your use of the service or from exchanges between users.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Changes</h2>
          <p>
            We may update these terms as the service evolves. Significant changes will be announced
            in the app. Continuing to use SkillSwap after changes take effect means you accept the
            updated terms.
          </p>
        </section>
      </div>
    </div>
  );
}