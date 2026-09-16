import { Link } from 'react-router-dom';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <Link to="/" className="btn-ghost text-sm -ml-2 inline-flex">← Back to home</Link>
      <h1 className="font-display font-bold text-3xl md:text-4xl text-ink-900 mt-4">Privacy Policy</h1>
      <p className="text-sm text-ink-500 mt-2">Last updated: September 2026</p>

      <div className="mt-8 space-y-8 text-sm text-ink-700 leading-relaxed">
        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">What we collect</h2>
          <p>
            When you create an account we collect your email address, display name, and the profile
            details you choose to add (university, department, bio, photo, availability, and the
            skills you teach or want to learn). We also store the messages, sessions, reviews and
            exchange records you create while using the app.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">How we use it</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To match you with other students who can exchange skills.</li>
            <li>To let you message, schedule and complete exchanges.</li>
            <li>To send you notifications about requests and replies you care about.</li>
            <li>To keep the platform safe and enforce our rules.</li>
          </ul>
          <p className="mt-3">
            We do not sell your data. We do not use it for advertising. We do not share your
            personal information with third parties except service providers we use to run the app
            (hosting, email delivery), who are bound to protect it.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Your profile is public within SkillSwap</h2>
          <p>
            Your display name, photo, university, bio, skills and reviews are visible to other
            registered students so they can decide whether to exchange skills with you. Anyone you
            block can no longer see you in matches or contact you.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">What we keep</h2>
          <p>
            We keep your account data until you delete it. When you delete your account we remove
            your profile and personal details from the live app. Content you created in exchanges
            you took part in may remain visible to the other participant.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Security</h2>
          <p>
            Passwords are stored only as salted hashes. All data is transferred over encrypted
            connections. Access to production data is limited to the people who maintain the app.
          </p>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg text-ink-900 mb-2">Contact</h2>
          <p>
            Questions about this policy can be sent to the SkillSwap support address provided on the
            app's contact page.
          </p>
        </section>
      </div>
    </div>
  );
}