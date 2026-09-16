import { BadgeCheck, CalendarDays, Check, Sparkles, TrendingUp, Wrench } from 'lucide-react';
import { Modal, Button } from '../ui/index.jsx';
import { CHANGELOG, markChangelogSeen } from '../../data/changelog.js';
import { formatDate } from '../../utils/format.js';

const SECTIONS = [
  { key: 'features', label: 'Fitur Baru', icon: Sparkles, iconClass: 'text-primary-600', chipClass: 'bg-primary-50 text-primary-700' },
  { key: 'improvements', label: 'Peningkatan', icon: TrendingUp, iconClass: 'text-success-600', chipClass: 'bg-success-50 text-success-700' },
  { key: 'fixes', label: 'Perbaikan', icon: Wrench, iconClass: 'text-warning-600', chipClass: 'bg-warning-50 text-warning-700' },
];

function ReleaseCard({ release, isLatest = false }) {
  return (
    <article className="rounded-xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_0_#0A0A0A]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg border-2 border-black bg-primary-500 px-2 py-0.5 font-mono text-xs font-extrabold text-white shadow-[2px_2px_0_0_#0A0A0A]">
            v{release.version}
          </span>
          {isLatest && (
            <span className="flex items-center gap-1 rounded-lg border border-black bg-success-100 px-2 py-0.5 text-[0.65rem] font-extrabold text-success-700">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" /> TERBARU
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDate(release.date)}
        </span>
      </div>
      <h4 className="mt-2 text-base font-extrabold text-slate-900">{release.title}</h4>
      {release.description && <p className="mt-1 text-sm font-medium text-slate-600">{release.description}</p>}

      {SECTIONS.filter((s) => (release[s.key]?.length || 0) > 0).map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.key} className="mt-4">
            <p className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold ${s.chipClass}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {s.label}
            </p>
            <ul className="mt-2 space-y-1.5" role="list">
              {release[s.key].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm font-medium text-slate-700">
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconClass}`} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </article>
  );
}

export function WhatNewModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apa yang Baru"
      size="lg"
      footer={
        <Button variant="primary" icon={Check} onClick={() => { markChangelogSeen(); onClose(); }}>
          Mengerti, tutup
        </Button>
      }
    >
      <p className="mb-4 text-sm font-medium text-slate-600">
        Lihat pembaruan terbaru dari aplikasi POS Kasir.
      </p>
      <div className="space-y-4">
        {CHANGELOG.map((release, i) => (
          <ReleaseCard key={release.version} release={release} isLatest={i === 0} />
        ))}
      </div>
    </Modal>
  );
}