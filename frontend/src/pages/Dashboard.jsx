import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { personAPI } from '../api';
import { formatDayMonth, localToday } from '../utils/dates';

const Tile = ({ value, label }) => (
  <div className="stat-tile">
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);

// Horizontal bars: one row per item
const BarList = ({ rows, unit }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">
            {r.value}
            {unit ? ` ${unit}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
};

// People born per decade (bars) and the total so far (line)
const GrowthChart = ({ growth, bornLabel, totalLabel }) => {
  const W = 600;
  const H = 220;
  const pad = { left: 36, right: 12, top: 12, bottom: 28 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const maxTotal = Math.max(1, ...growth.map((g) => g.total));
  const slot = innerW / growth.length;
  const barW = Math.min(36, slot * 0.6);
  const x = (i) => pad.left + slot * i + slot / 2;
  const y = (v) => pad.top + innerH - (v / maxTotal) * innerH;
  const linePoints = growth.map((g, i) => `${x(i)},${y(g.total)}`).join(' ');
  const every = Math.ceil(growth.length / 8); // not too many decade labels

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="growth-chart"
      role="img"
      aria-label={`${bornLabel} / ${totalLabel}`}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={W - pad.right} y1={y(maxTotal * f)} y2={y(maxTotal * f)} className="chart-grid" />
          <text x={pad.left - 6} y={y(maxTotal * f) + 4} textAnchor="end" className="chart-text">
            {Math.round(maxTotal * f)}
          </text>
        </g>
      ))}
      {growth.map((g, i) => (
        <g key={g.decade}>
          <rect
            x={x(i) - barW / 2}
            y={y(g.born)}
            width={barW}
            height={Math.max(0, pad.top + innerH - y(g.born))}
            className="chart-bar"
          >
            <title>{`${g.decade}s: ${g.born}`}</title>
          </rect>
          {i % every === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-text">
              {g.decade}
            </text>
          )}
        </g>
      ))}
      <polyline points={linePoints} className="chart-line" fill="none" />
      {growth.map((g, i) => (
        <circle key={g.decade} cx={x(i)} cy={y(g.total)} r="3.5" className="chart-dot">
          <title>{`${g.decade}s: ${g.total}`}</title>
        </circle>
      ))}
    </svg>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  const canSeeStats = isAdmin || !!user?.showStats; // admins always, members when an admin allowed it

  useEffect(() => {
    if (!canSeeStats) return undefined;
    let cancelled = false;
    personAPI
      .getStats(localToday())
      .then((res) => !cancelled && setStats(res.data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [canSeeStats]);

  const when = (daysAway) => {
    if (daysAway === 0) return t('today', 'Today');
    if (daysAway === 1) return t('tomorrow', 'Tomorrow');
    return t('inDays', { n: daysAway, defaultValue: 'In {{n}} days' });
  };

  const renderStats = () => {
    if (failed) return <div className="no-data">{t('statsFailed', 'The statistics could not be loaded.')}</div>;
    if (!stats) return <div className="loading">{t('loading')}</div>;
    if (stats.total === 0) return <div className="no-data">{t('noData')}</div>;

    const hasChartData = stats.growth.length > 0;

    return (
      <>
        <div className="stat-tiles">
          <Tile value={stats.total} label={t('statPeople', 'People')} />
          <Tile value={stats.living} label={t('statLiving', 'Living')} />
          <Tile value={stats.deceased} label={t('statDeceased', 'Deceased')} />
          <Tile value={stats.couples} label={t('statCouples', 'Couples')} />
          <Tile value={stats.generations} label={t('statGenerations', 'Generations')} />
          <Tile
            value={stats.averageLifespan !== null ? stats.averageLifespan : '–'}
            label={t('statAverageAge', 'Average age at death')}
          />
        </div>

        <div className="insight-grid">
          <section className="insight-card">
            <h2>{t('upcomingBirthdays', 'Coming birthdays')}</h2>
            {stats.birthdays.length === 0 ? (
              <p className="muted">{t('noBirthdays', 'No birthdays in the next 30 days.')}</p>
            ) : (
              <ul className="birthday-list">
                {stats.birthdays.map((b) => (
                  <li key={b.id} className={b.daysAway === 0 ? 'birthday-today' : undefined}>
                    <span className="birthday-name">
                      {b.daysAway === 0 && <span aria-hidden="true">🥳 </span>}
                      {b.name}
                    </span>
                    <span className="birthday-detail">
                      {formatDayMonth(b.day, b.month)} · {t('turnsAge', { n: b.turns, defaultValue: 'turns {{n}}' })}
                    </span>
                    <span className="birthday-when">{when(b.daysAway)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="insight-card">
            <h2>{t('familyFacts', 'Family facts')}</h2>
            <dl className="facts">
              {stats.oldestLiving && (
                <>
                  <dt>{t('oldestLiving', 'Oldest living')}</dt>
                  <dd>{stats.oldestLiving.name} ({stats.oldestLiving.age})</dd>
                </>
              )}
              {stats.youngestLiving && (
                <>
                  <dt>{t('youngestLiving', 'Youngest')}</dt>
                  <dd>{stats.youngestLiving.name} ({stats.youngestLiving.age})</dd>
                </>
              )}
              {stats.largestGeneration && (
                <>
                  <dt>{t('largestGeneration', 'Largest generation')}</dt>
                  <dd>
                    {t('generationN', { n: stats.largestGeneration.number, defaultValue: 'Generation {{n}}' })} ·{' '}
                    {t('peopleCount', { n: stats.largestGeneration.size, defaultValue: '{{n}} people' })}
                  </dd>
                </>
              )}
            </dl>
            {stats.onThisDay.length > 0 && (
              <>
                <h3>{t('onThisDay', 'On this day')}</h3>
                <ul className="plain-list">
                  {stats.onThisDay.map((e) => (
                    <li key={`${e.id}-${e.kind}`}>
                      {e.year} · {e.name}{' '}
                      <span className="muted">
                        ({e.kind === 'born' ? t('bornWord', 'born') : t('diedWord', 'died')})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {stats.generationSizes.length > 1 && (
            <section className="insight-card">
              <h2>{t('peoplePerGeneration', 'People per generation')}</h2>
              <BarList
                rows={stats.generationSizes.map((n, i) => ({
                  label: t('generationN', { n: i + 1, defaultValue: 'Generation {{n}}' }),
                  value: n
                }))}
              />
            </section>
          )}

          {hasChartData && (
            <section className="insight-card insight-wide">
              <h2>{t('familyGrowth', 'Family growth')}</h2>
              <GrowthChart
                growth={stats.growth}
                bornLabel={t('bornPerDecade', 'Born per decade')}
                totalLabel={t('totalSoFar', 'Total so far')}
              />
              <div className="chart-legend">
                <span><i className="legend-bar" /> {t('bornPerDecade', 'Born per decade')}</span>
                <span><i className="legend-line" /> {t('totalSoFar', 'Total so far')}</span>
              </div>
            </section>
          )}

          {stats.topFirstNames.length > 0 && (
            <section className="insight-card">
              <h2>{t('commonFirstNames', 'Most common first names')}</h2>
              <BarList rows={stats.topFirstNames.map((n) => ({ label: n.name, value: n.count }))} />
            </section>
          )}

          {stats.topLastNames.length > 0 && (
            <section className="insight-card">
              <h2>{t('commonLastNames', 'Most common last names')}</h2>
              <BarList rows={stats.topLastNames.map((n) => ({ label: n.name, value: n.count }))} />
            </section>
          )}

          {stats.recentlyAdded.length > 0 && (
            <section className="insight-card">
              <h2>{t('recentlyAdded', 'Recently added')}</h2>
              <ul className="plain-list">
                {stats.recentlyAdded.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="dashboard">
      <h1>{t('welcome')}, {user?.username}!</h1>

      <div className="dashboard-cards">
        <div className="dashboard-card" onClick={() => navigate('/tree')}>
          <h2>{t('familyTree')}</h2>
          <p>{t('viewTree')}</p>
        </div>
        {isAdmin ? (
          <div className="dashboard-card" onClick={() => navigate('/people')}>
            <h2>{t('allPeople')}</h2>
            <p>{t('viewList')}</p>
          </div>
        ) : (
          <div className="dashboard-card" onClick={() => navigate('/gallery')}>
            <h2>{t('galleryTitle')}</h2>
            <p>{t('dashGalleryText')}</p>
          </div>
        )}
        {isAdmin && (
          <div className="dashboard-card" onClick={() => navigate('/people/new')}>
            <h2>{t('addPerson')}</h2>
            <p>{t('createSuccess')}</p>
          </div>
        )}
        {!isAdmin && (
          <div className="dashboard-card" onClick={() => navigate('/relationship')}>
            <h2>{t('relationshipFinder')}</h2>
            <p>{t('findRelationship')}</p>
          </div>
        )}
        {!isAdmin && (
          <div className="dashboard-card" onClick={() => navigate('/suggest')}>
            <h2>{t('suggestTitle')}</h2>
            <p>{t('dashSuggestText')}</p>
          </div>
        )}
        {isAdmin && (
          <div className="dashboard-card admin-card" onClick={() => navigate('/admin')}>
            <h2>{t('adminPanel')}</h2>
            <p>{t('manageUsers')}</p>
          </div>
        )}
      </div>

      {canSeeStats && renderStats()}

    </div>
  );
};

export default Dashboard;
