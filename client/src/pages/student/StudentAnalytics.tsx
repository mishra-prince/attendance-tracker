import { useEffect, useState } from 'react';
import { CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { Page, Stagger, StaggerItem, spring } from '../../components/motion';
import { CardSkeleton, Skeleton } from '../../components/skeletons';

// Consistent per-subject color mapping — same subject, same color in every chart
const PALETTE = ['#7170ff', '#ff453a', '#fbbf24', '#34d399', '#c084fc', '#38bdf8', '#fb923c'];

interface SubjectRow { subject_name: string; subject_code: string; percentage: number; }
interface Summary {
  overall: { percentage: number | null; eligible_sessions: number; counted_present: number };
  subjects: SubjectRow[];
}

const AXIS = { stroke: 'rgba(245,241,238,0.4)', fontSize: 11, fontFamily: 'Inter, sans-serif' };
const TOOLTIP_STYLE = {
  background: 'rgba(28,27,30,0.92)',
  border: '1px solid rgba(245,241,238,0.12)',
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
  color: '#f5f1ee',
};

export default function StudentAnalytics() {
  const user = useAuth((s) => s.user)!;
  const [rows, setRows] = useState<SubjectRow[]>([]);
  const [overall, setOverall] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user.studentId) return;
    api.get(`/students/${user.studentId}/attendance/summary`).then(r => {
      setRows(r.data.data.subjects ?? []);
      setOverall(r.data.data.overall?.percentage ?? null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user.studentId]);

  const codeColor = new Map(rows.map((r, i) => [r.subject_code, PALETTE[i % PALETTE.length]]));
  const pieData = rows.map(r => ({ name: r.subject_code, value: Math.round(r.percentage) }));
  const barData = rows.map(r => ({ name: r.subject_code, pct: Math.round(r.percentage) }));

  return (
    <Page className="p-4 pt-6 space-y-5" >
      <h1 className="text-xl font-semibold text-bone tracking-tight">My Analytics</h1>
      {loading && (
        <>
          <CardSkeleton h="h-32" />
          <CardSkeleton h="h-48" />
        </>
      )}
      {overall !== null && (
        <Stagger>
          <StaggerItem className="glass-medium rounded-2xl p-5 text-center card-lift">
            <div className="text-4xl font-bold text-signal tracking-tight" style={{ fontFeatureSettings: "'tnum'" }}>{overall.toFixed(1)}%</div>
            <div className="text-ash text-sm mt-1">Overall attendance</div>
          </StaggerItem>
          {rows.length === 0 && (
            <StaggerItem className="glass-medium rounded-2xl p-6 text-center text-muted">No attendance data yet</StaggerItem>
          )}
          {rows.length > 0 && (
            <>
              <StaggerItem className="glass-medium rounded-2xl p-4 card-lift">
                <h2 className="text-bone/80 text-sm mb-3 font-medium">Per-subject attendance</h2>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={barData} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,241,238,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ ...AXIS }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ ...AXIS }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(245,241,238,0.04)' }} />
                      <Bar dataKey="pct" radius={[6, 6, 2, 2]} maxBarSize={44}>
                        {barData.map((d, i) => (
                          <Cell key={i} fill={codeColor.get(d.name)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </StaggerItem>
              <StaggerItem className="glass-medium rounded-2xl p-4 card-lift">
                <h2 className="text-bone/80 text-sm mb-3 font-medium">Attendance share</h2>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={pieData} dataKey="value" nameKey="name"
                        innerRadius={48} outerRadius={72} paddingAngle={3} cornerRadius={4}
                        animationBegin={200} animationDuration={900}
                      >
                        {pieData.map((d, i) => <Cell key={i} fill={codeColor.get(d.name)} stroke="none" />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* custom legend — themed font, swatches match charts, readable size */}
                <div className="flex flex-wrap gap-3 justify-center mt-1">
                  {rows.map((r) => (
                    <span key={r.subject_code} className="inline-flex items-center gap-1.5 text-xs text-ash">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: codeColor.get(r.subject_code) }} />
                      {r.subject_code} · {Math.round(r.percentage)}%
                    </span>
                  ))}
                </div>
              </StaggerItem>
            </>
          )}
        </Stagger>
      )}
    </Page>
  );
}
