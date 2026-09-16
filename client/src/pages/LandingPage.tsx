import { Link } from 'react-router-dom';
import { ArrowRight, Search, Users, MessageCircle, Sparkles, Repeat, Shield, Bell } from 'lucide-react';

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-coral-100 rounded-full blur-3xl opacity-50" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-mint-100 rounded-full blur-3xl opacity-50" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-20 md:pt-24 md:pb-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="chip-coral mb-4 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Peer-to-peer skill exchange
            </span>
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-ink-900 leading-[1.05] tracking-tight">
              Trade what you know for what you want to learn.
            </h1>
            <p className="mt-5 text-lg text-ink-600 max-w-lg">
              Find someone who can teach the skill you need, offer one you already have, and learn together.
              SkillSwap connects students who can help each other grow.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/signup" className="btn-coral text-base px-5 py-3">
                Find Your Match <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#how" className="btn-outline text-base px-5 py-3">
                Explore Skills
              </a>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-ink-600">
              <Repeat className="w-4 h-4 text-coral-500" />
              Real people, verified reciprocal matches, no fake accounts.
            </div>
          </div>

          <div className="card p-6 md:p-8">
            <h2 className="font-display font-bold text-2xl text-ink-900">How matching works</h2>
            <div className="mt-5 space-y-4">
              {[
                { icon: Users, title: 'You add two lists', body: 'What you can teach, and what you want to learn.' },
                { icon: Repeat, title: 'We find the overlap', body: 'Your matches are scored on exact, reciprocal skill overlap, never on guesses.' },
                { icon: Shield, title: 'You decide who you meet', body: 'Send a request when you want to. Every user is verified and you control who can contact you.' },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cream-100 flex items-center justify-center text-ink-900 shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-ink-900">{item.title}</div>
                    <div className="text-sm text-ink-600 mt-0.5">{item.body}</div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <div className="w-10 h-10 rounded-xl bg-cream-100 flex items-center justify-center text-ink-900 shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-ink-900">You stay in control</div>
                  <div className="text-sm text-ink-600 mt-0.5">
                    Chat, schedule sessions, and review only after a real exchange. Block and report tools are built in.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink-900">How SkillSwap works</h2>
            <p className="text-ink-600 mt-2">Four steps to your first exchange.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Users, title: 'Tell us what you know', body: 'Add skills you can teach and what you want to learn.' },
              { icon: Search, title: 'Discover your matches', body: 'SkillSwap calculates reciprocal skill matches.' },
              { icon: MessageCircle, title: 'Send an exchange request', body: 'Reach out and propose a skill swap.' },
              { icon: Sparkles, title: 'Learn together', body: 'Chat, schedule sessions, and review each other.' },
            ].map((step, i) => (
              <div
                key={i}
                className="card p-6"
              >
                <div className="w-11 h-11 rounded-xl bg-cream-100 flex items-center justify-center text-ink-900 mb-4">
                  <step.icon className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-coral-500 uppercase tracking-wide mb-1">
                  Step {i + 1}
                </div>
                <h3 className="font-display font-bold text-lg text-ink-900">{step.title}</h3>
                <p className="text-sm text-ink-600 mt-1.5">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular skills */}
      <section id="skills" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink-900">Skills people trade</h2>
            <p className="text-ink-600 mt-2">Explore the most popular categories.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { cat: 'Technology', skills: ['Python', 'JavaScript', 'React', 'SQL'] },
              { cat: 'Design', skills: ['Figma', 'Photoshop', 'UI Design', 'Branding'] },
              { cat: 'Creative', skills: ['Photography', 'Video Editing', 'Drawing'] },
              { cat: 'Languages', skills: ['French', 'Spanish', 'Mandarin', 'Arabic'] },
            ].map((c) => (
              <div key={c.cat} className="card p-5">
                <h3 className="font-display font-bold text-ink-900 mb-3">{c.cat}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <span key={s} className="chip-cream">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why SkillSwap */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="card p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center bg-gradient-to-br from-cream-50 to-mint-50">
            <div>
              <h2 className="font-display font-bold text-3xl text-ink-900">Why SkillSwap?</h2>
              <p className="text-ink-700 mt-3">
                We make knowledge exchange feel natural. No courses, no ads, just people who can help each other.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Free to use, forever',
                  'Deterministic, explainable matches',
                  'Real-time messaging built in',
                  'Designed for mobile',
                ].map((b) => (
                  <li key={b} className="flex items-center gap-2 text-ink-800">
                    <div className="w-5 h-5 rounded-full bg-mint-500 flex items-center justify-center text-white text-xs">✓</div>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-center">
              <Link to="/signup" className="btn-coral text-base px-6 py-3.5">
                Start swapping skills <ArrowRight className="w-4 h-4" />
              </Link>
              <div className="text-xs text-ink-500 mt-3">Free to join · No credit card required</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}