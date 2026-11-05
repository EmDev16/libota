import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { personAPI } from '../api';
import { formatDayMonth, localToday } from '../utils/dates';
import AdminOverview, { GalleryCard } from '../components/AdminOverview';
import Guide from '../components/Guide';

// Remembered per account in this browser; the site works without it
const guideKey = (username) => `libota-guide-hidden:${username}`;
const readGuideHidden = (username) => {
  try {
    return localStorage.getItem(guideKey(username)) === '1';
  } catch {
    return false;
  }
};

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

// Twelve columns, one per month (the current month is marked)
const MonthChart = ({ counts, labels, current }) => {
  const max = Math.max(1, ...counts);
  return (
    <div className="month-chart">
      {counts.map((n, i) => (
        <div key={i} className={`month-col${i === current ? ' month-now' : ''}`} title={`${labels.long[i]}: ${n}`}>
          <span className="month-n">{n > 0 ? n : ''}</span>
          <span className="month-bar" style={{ height: `${(n / max) * 100}%` }} />
          <span className="month-label">{labels.short[i]}</span>
        </div>
      ))}
    </div>
  );
};

// Month names in the language of the site (Lingala falls back to French, which browsers know)
const monthNames = (language) => {
  const lang = (language || 'en').slice(0, 2) === 'ln' ? 'fr' : language || 'en';
  const names = (style) =>
    Array.from({ length: 12 }, (_, m) => {
      try {
        return new Date(2000, m, 1).toLocaleDateString(lang, { month: style });
      } catch {
        return String(m + 1);
      }
    });
  return { short: names('narrow'), long: names('long') };
};

const Dashboard = () => {
  const { t, i18n } = useTranslation();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);
  // Members without the statistics see the guide straight away, until they hide it
  const [guideOpen, setGuideOpen] = useState(
    () => !isAdmin && !user?.showStats && !readGuideHidden(user?.username)
  );

  const openGuide = () => {
    setGuideOpen(true);
    setTimeout(() => {
      const el = document.getElementById('guide');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const hideGuide = () => {
    setGuideOpen(false);
    try {
      localStorage.setItem(guideKey(user?.username), '1');
    } catch {
      /* not saved: the guide shows again next time */
    }
  };

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

    return (
      <>
        <div className="stat-tiles">
          <Tile value={stats.total} label={t('statPeople', 'People')} />
          <Tile value={stats.living} label={t('statLiving', 'Living')} />
          <Tile value={stats.deceased} label={t('statDeceased', 'Deceased')} />
          <Tile value={stats.couples} label={t('statCouples', 'Couples')} />
          <Tile value={stats.generations} label={t('statGenerations', 'Generations')} />
          <Tile
            value={stats.averageAge !== null && stats.averageAge !== undefined ? stats.averageAge : '–'}
            label={t('statAverageAge', 'Average age')}
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

          {stats.ageGroups && stats.ageGroups.some((g) => g.count > 0) && (
            <section className="insight-card">
              <h2>{t('dashAgeGroups')}</h2>
              <BarList
                rows={stats.ageGroups.map((g) => ({
                  label: t(`age${g.key.charAt(0).toUpperCase()}${g.key.slice(1)}`),
                  value: g.count
                }))}
              />
            </section>
          )}

          {stats.birthdaysByMonth && stats.birthdaysByMonth.some((n) => n > 0) && (
            <section className="insight-card">
              <h2>{t('dashBirthMonths')}</h2>
              <MonthChart
                counts={stats.birthdaysByMonth}
                labels={monthNames(i18n.language)}
                current={new Date(`${stats.today}T00:00:00Z`).getUTCMonth()}
              />
            </section>
          )}

          {stats.biggestFamilies && stats.biggestFamilies.length > 0 && (
            <section className="insight-card">
              <h2>{t('dashBiggestFamilies')}</h2>
              <ul className="plain-list">
                {stats.biggestFamilies.map((f) => (
                  <li key={f.id}>
                    {f.parents.join(' & ')}{' '}
                    <span className="muted">· {t('familyChildren', { n: f.children })}</span>
                  </li>
                ))}
              </ul>
              {stats.averageChildren !== null && stats.averageChildren !== undefined && (
                <dl className="facts">
                  <dt>{t('dashAvgChildren')}</dt>
                  <dd>{stats.averageChildren}</dd>
                </dl>
              )}
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

          <GalleryCard />
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
            <p>{t('dashAddPersonText')}</p>
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
        {!isAdmin && (
          <div className="dashboard-card" onClick={openGuide}>
            <h2>{t('guideCard')}</h2>
            <p>{t('guideCardText')}</p>
          </div>
        )}
        {isAdmin && (
          <div className="dashboard-card admin-card" onClick={() => navigate('/admin')}>
            <h2>{t('adminPanel')}</h2>
            <p>{t('manageUsers')}</p>
          </div>
        )}
      </div>

      {!isAdmin && guideOpen && <Guide onHide={hideGuide} />}

      {canSeeStats && renderStats()}

      {canSeeStats && <AdminOverview isAdmin={isAdmin} />}

    </div>
  );
};

export default Dashboard;
