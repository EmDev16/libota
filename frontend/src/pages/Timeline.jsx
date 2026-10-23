import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI, galleryAPI } from '../api';
import { formatDate } from '../utils/dates';
import { buildTimeline, groupByYear } from '../utils/timeline';

const Timeline = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [people, setPeople] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState('all'); // all | born | died | photo
  const [order, setOrder] = useState('newest'); // newest | oldest

  useEffect(() => {
    personAPI
      .getAll()
      .then((res) => setPeople(res.data))
      .catch(() => setFailed(true));
    // photos with the hidden tag "timeline"; the timeline still works without them
    galleryAPI
      .list({ timeline: 1 })
      .then((res) => setPhotos(res.data))
      .catch(() => {});
  }, []);

  const groups = useMemo(
    () => (people ? groupByYear(buildTimeline(people, kind, photos), order) : []),
    [people, photos, kind, order]
  );

  if (failed) return <div className="no-data">{t('error')}</div>;
  if (!people) return <div className="loading">{t('loading')}</div>;

  const chip = (value, current, set, label) => (
    <button
      type="button"
      className={`chip${current === value ? ' chip-active' : ''}`}
      aria-pressed={current === value}
      onClick={() => set(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="timeline-page">
      <h1>{t('timeline', 'Timeline')}</h1>

      <div className="timeline-controls">
        <div className="chip-group">
          {chip('all', kind, setKind, t('timelineAll', 'Births and deaths'))}
          {chip('born', kind, setKind, t('timelineBorn', 'Births'))}
          {chip('died', kind, setKind, t('timelineDied', 'Deaths'))}
          {photos.length > 0 && chip('photo', kind, setKind, t('timelinePhotos'))}
        </div>
        <div className="chip-group">
          {chip('newest', order, setOrder, t('newestFirst', 'Newest first'))}
          {chip('oldest', order, setOrder, t('oldestFirst', 'Oldest first'))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="no-data">{t('noData')}</div>
      ) : (
        <ol className="timeline">
          {groups.map((g) => (
            <li key={g.year} className="timeline-year">
              <h2>{g.year}</h2>
              <ul>
                {g.events.map((e) => (
                  <li key={e.key}>
                    <button
                      type="button"
                      className="timeline-event"
                      onClick={() => navigate(e.kind === 'photo' ? `/gallery?photo=${e.photoId}` : `/tree?person=${e.personId}`)}
                    >
                      <span className="timeline-date">{formatDate(e.date)}</span>
                      <span className={`timeline-kind timeline-${e.kind}`}>
                        {e.kind === 'born' ? t('bornWord', 'born') : e.kind === 'died' ? t('diedWord', 'died') : t('photoWord')}
                      </span>
                      <span className="timeline-name">{e.name}</span>
                      {e.kind === 'died' && e.age !== null && (
                        <span className="timeline-age">
                          {t('agedN', { n: e.age, defaultValue: 'aged {{n}}' })}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default Timeline;
