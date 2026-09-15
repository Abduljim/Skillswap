import { Link } from 'react-router-dom';
import { ArrowRight, Search, Users, MessageCircle, Sparkles } from 'lucide-react';
import { SkillsConstellation } from '../components/SkillsConstellation';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const skills = ['Python', 'Photoshop', 'Figma', 'French', 'Photography', 'Guitar', 'Excel', 'Marketing'];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % skills.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-coral-200 rounded-full blur-3xl opacity-50" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-mint-200 rounded-full blur-3xl opacity-50" />
          <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-lavender-200 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-20 md:pt-24 md:pb-32 grid lg:grid-cols-2 gap-12 items-center">
          <div>
              <span className="chip-coral mb-4 inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Peer-to-peer skill exchange
              </span>
              <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-ink-900 leading-[1.05] tracking-tight">
                Trade what you know for what you want to learn.
              </h1>
              <p className="mt-5 text-lg text-ink-600 max-w-lg">
                Find someone with the skill you need, offer something you know, and help each other grow.
                SkillSwap connects students who can teach each other.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/signup" className="btn-coral text-base px-5 py-3">
                  Find Your Match <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#how" className="btn-outline text-base px-5 py-3">
                  Explore Skills
                </a>
              </div>
              <div className="mt-8 flex items-center gap-4 text-sm text-ink-600">
                <div className="flex -space-x-2">
                  {[
                    'https://i.pravatar.cc/40?img=47',
                    'https://i.pravatar.cc/40?img=12',
                    'https://i.pravatar.cc/40?img=33',
                    'https://i.pravatar.cc/40?img=49',
                  ].map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="w-8 h-8 rounded-full border-2 border-cream-50 object-cover"
                    />
                  ))}
                </div>
                <div>
                  Join <span className="font-semibold text-ink-900">2,300+</span> students already exchanging skills
                </div>
              </div>
            </div>

          <div className="relative h-[420px] md:h-[520px]">
            <SkillsConstellation activeSkill={skills[idx]} skills={skills} />
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
                className="card p-6 animate-slide-up"
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

      {/* Example exchange */}
      <section className="py-16 md:py-24 bg-ink-900 text-cream-50 rounded-3xl max-w-6xl mx-auto px-4 sm:px-6 my-12 mx-4 sm:mx-6">
        <div className="text-center mb-10">
          <h2 className="font-display font-bold text-3xl sm:text-4xl">A real exchange</h2>
          <p className="text-cream-200 mt-2">Watch two students discover they can help each other.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="bg-ink-800 rounded-2xl p-6 border border-ink-700">
            <div className="flex items-center gap-3 mb-3">
              <img src="https://i.pravatar.cc/80?img=47" className="w-10 h-10 rounded-full" alt="" />
              <div>
                <div className="font-semibold">Alice</div>
                <div className="text-xs text-cream-300">Computer Science</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-coral-300 font-semibold">Teaches</div>
              <div className="flex flex-wrap gap-2">
                <span className="chip bg-mint-500/20 text-mint-200">Python</span>
                <span className="chip bg-mint-500/20 text-mint-200">SQL</span>
              </div>
              <div className="text-xs uppercase tracking-wide text-coral-300 font-semibold mt-3">Wants to learn</div>
              <div className="flex flex-wrap gap-2">
                <span className="chip bg-coral-500/20 text-coral-200">Figma</span>
              </div>
            </div>
          </div>

          <div className="bg-ink-800 rounded-2xl p-6 border border-ink-700">
            <div className="flex items-center gap-3 mb-3">
              <img src="https://i.pravatar.cc/80?img=12" className="w-10 h-10 rounded-full" alt="" />
              <div>
                <div className="font-semibold">Bob</div>
                <div className="text-xs text-cream-300">Design</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-coral-300 font-semibold">Teaches</div>
              <div className="flex flex-wrap gap-2">
                <span className="chip bg-mint-500/20 text-mint-200">Figma</span>
              </div>
              <div className="text-xs uppercase tracking-wide text-coral-300 font-semibold mt-3">Wants to learn</div>
              <div className="flex flex-wrap gap-2">
                <span className="chip bg-coral-500/20 text-coral-200">Python</span>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center mt-8">
          <div className="inline-flex items-center gap-3 bg-coral-500 text-white rounded-full px-6 py-3 font-semibold">
            <span>Alice ↔ Bob</span>
            <span className="opacity-80">94% reciprocal match</span>
          </div>
        </div>
      </section>

      {/* Popular skills */}
      <section id="skills" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink-900">Skills people are trading</h2>
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
          <div className="card p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center bg-gradient-to-br from-cream-50 to-lavender-50">
            <div>
              <h2 className="font-display font-bold text-3xl text-ink-900">Why SkillSwap?</h2>
              <p className="text-ink-700 mt-3">
                We make knowledge exchange feel natural. No courses, no subscriptions, no ads. Just people who can help
                each other.
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