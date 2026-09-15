import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Skeleton } from '../components/ui';
import { Users, Repeat, CheckCircle2, Flag, BookOpen, TrendingUp } from 'lucide-react';

export default function AdminPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<any>('/admin/stats'),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display font-bold text-3xl text-ink-900">Admin dashboard</h1>
      {isLoading && <Skeleton className="h-32" />}
      {data && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Users" value={data.userCount} icon={<Users className="w-4 h-4" />} />
            <Stat label="Active" value={data.activeUserCount} icon={<Users className="w-4 h-4" />} accent="mint" />
            <Stat label="Active exchanges" value={data.activeExchanges} icon={<Repeat className="w-4 h-4" />} accent="coral" />
            <Stat label="Completed" value={data.completedExchanges} icon={<CheckCircle2 className="w-4 h-4" />} />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Link to="/admin/users" className="card p-5 hover:shadow-soft-lg transition-all">
              <Users className="w-5 h-5 text-ink-700 mb-2" />
              <h3 className="font-display font-bold">Manage users</h3>
              <p className="text-xs text-ink-500 mt-1">Activate, deactivate, promote admins.</p>
            </Link>
            <Link to="/admin/skills" className="card p-5 hover:shadow-soft-lg transition-all">
              <BookOpen className="w-5 h-5 text-ink-700 mb-2" />
              <h3 className="font-display font-bold">Manage skills</h3>
              <p className="text-xs text-ink-500 mt-1">Create, edit, deactivate.</p>
            </Link>
            <Link to="/admin/reports" className="card p-5 hover:shadow-soft-lg transition-all">
              <Flag className="w-5 h-5 text-ink-700 mb-2" />
              <h3 className="font-display font-bold">Reports</h3>
              <p className="text-xs text-ink-500 mt-1">{data.openReports} open reports.</p>
            </Link>
          </div>

          {data.popularSkills?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-display font-bold text-ink-900 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Most taught skills
              </h3>
              <div className="space-y-2">
                {data.popularSkills.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="text-sm">{s.name}</span>
                    <span className="text-xs text-ink-500">{s.teacherCount} teachers</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.mostRequested?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-display font-bold text-ink-900 mb-3">Most wanted skills</h3>
              <div className="space-y-2">
                {data.mostRequested.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="text-sm">{s.name}</span>
                    <span className="text-xs text-ink-500">{s.learnerCount} learners</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon, accent = 'ink' }: any) {
  const accentClass =
    accent === 'coral' ? 'bg-coral-100 text-coral-700' :
    accent === 'mint' ? 'bg-mint-100 text-mint-700' :
    'bg-cream-100 text-ink-700';
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-500 uppercase tracking-wide font-medium">{label}</div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentClass}`}>{icon}</div>
      </div>
      <div className="mt-1 text-2xl font-display font-bold text-ink-900">{value}</div>
    </div>
  );
}