import { Crown, Download, Medal, Printer, Trophy } from 'lucide-react';
import { qualificationQuota, sorted, type Competition, type Division, type Group, type ScoringRules, type Team } from '../data';
import { downloadWinnerCertificate } from '../lib/certificate';

type Props = {
  competition: Competition;
  categories: Division[];
  groups: Group[];
  teams: Record<string, Team[]>;
  rules: ScoringRules;
};

export default function ResultsArchive({ competition, categories, groups, teams, rules }: Props) {
  const finalized = groups.filter((g) => g.status === 'final');
  const official = finalized.filter((g) => g.results_approved);
  const pendingApproval = finalized.filter((g) => !g.results_approved);
  const finals = (official.length ? official : finalized).filter((g) => g.stage === 'Final');
  const semis = (official.length ? official : finalized).filter((g) => g.stage === 'Semifinal');

  const print = () => window.print();

  return (
    <div className="container page results-archive">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Trophy size={15} /> OFFICIAL ARCHIVE
          </div>
          <h1>Results & podium</h1>
          <p>Finalized qualification outcomes, semifinalists, finalists and championship podium.</p>
        </div>
        <button className="outline-btn" onClick={print}>
          <Printer size={17} /> Print official results
        </button>
      </div>

      <div className="print-header">
        <strong>{competition.title}</strong>
        <span>
          {competition.year} · {competition.venue || 'Official results'}
        </span>
      </div>
      {!!pendingApproval.length && (
        <div className="hint">
          {pendingApproval.length} finalized group(s) await administrator approval before they are marked official.
        </div>
      )}

      {finals.map((g) => {
        const ranking = sorted(teams[g.id] || []);
        const cat = categories.find((c) => c.id === g.category_id)?.name || 'Category';
        return (
          <section className="podium-section" key={g.id}>
            <h2>
              {cat} · Grand Final podium
            </h2>
            <div className="podium">
              {[1, 0, 2].map((idx) => {
                const t = ranking[idx];
                if (!t) return <div className={'podium-slot place-' + (idx + 1)} key={idx} />;
                const label = idx === 0 ? 'Champion' : idx === 1 ? 'First Runner-Up' : 'Second Runner-Up';
                return (
                  <div className={'podium-slot place-' + (idx + 1)} key={t.id}>
                    <div className="podium-medal">{idx === 0 ? <Crown size={28} /> : <Medal size={24} />}</div>
                    <strong>{t.short_name}</strong>
                    <span>{label}</span>
                    <em>{t.score} pts</em>
                    <button
                      className="outline-btn small"
                      type="button"
                      onClick={() =>
                        downloadWinnerCertificate({
                          competition,
                          schoolName: t.name,
                          placeLabel: label,
                          categoryName: cat,
                          score: t.score,
                        })
                      }
                    >
                      <Download size={14} /> Certificate
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {!finals.length && (
        <div className="hint">Championship podium appears after a Final group is finalized.</div>
      )}

      <section className="results-block">
        <h2>Semifinalists</h2>
        {semis.length ? (
          semis.map((g) => {
            const quota = qualificationQuota((teams[g.id] || []).length, rules, g.stage);
            const ranking = sorted(teams[g.id] || []).slice(0, quota);
            const cat = categories.find((c) => c.id === g.category_id)?.name;
            return (
              <div key={g.id} className="results-card">
                <h3>
                  {cat} · {g.name}
                </h3>
                <ol>
                  {ranking.map((t) => (
                    <li key={t.id}>
                      {t.name} <span>{t.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })
        ) : (
          <p className="empty-board">No finalized semifinals yet.</p>
        )}
      </section>

      <section className="results-block">
        <h2>Opening-round qualification</h2>
        <div className="results-grid">
          {finalized
            .filter((g) => g.stage === 'Opening Round')
            .map((g) => {
              const quota = qualificationQuota((teams[g.id] || []).length, rules, g.stage);
              const ranking = sorted(teams[g.id] || []);
              const cat = categories.find((c) => c.id === g.category_id)?.name;
              return (
                <div key={g.id} className="results-card">
                  <h3>
                    {cat} · {g.name}
                  </h3>
                  <ol>
                    {ranking.map((t, i) => (
                      <li key={t.id} className={i < quota ? 'qualified' : 'eliminated'}>
                        {t.name} <span>{t.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
        </div>
        {!finalized.some((g) => g.stage === 'Opening Round') && <p className="empty-board">No finalized opening groups yet.</p>}
      </section>
    </div>
  );
}
