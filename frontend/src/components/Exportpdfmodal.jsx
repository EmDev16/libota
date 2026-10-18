import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPeopleForExport, generateFamilyPdf } from '../utils/pdfExport';

const UP_LABELS = [
  'The person themself',
  'Parents',
  'Grandparents',
  'Great-grandparents',
  'Great-great-grandparents',
  '5 generations up',
  '6 generations up'
];

const DOWN_LABELS = [
  "Stop at the person's own generation",
  'Children',
  'Grandchildren',
  'Great-grandchildren',
  '4 generations down',
  '5 generations down',
  '6 generations down'
];

// Quick settings for the most common cases
const PRESETS = [
  { label: 'Descendants', up: 0, down: 'all' },
  { label: 'Siblings', up: 1, down: '0' },
  { label: 'First cousins', up: 2, down: '0' },
  { label: 'Second cousins', up: 3, down: '0' },
  { label: 'Great-grandparents and all descendants', up: 3, down: 'all' }
];

const PAGE_MODES = [
  {
    value: 'fit',
    title: 'One page (poster)',
    text: 'The whole tree on a single large page. Best on screen or printed on a plotter.'
  },
  {
    value: 'tiles',
    title: 'Split across several pages',
    text: 'The tree is cut into normal paper pages you can print and tape together.'
  },
  {
    value: 'branches',
    title: 'One page per branch',
    text: 'An overview page, then one page for every branch of the family.'
  }
];

const ExportPdfModal = ({ people, initialRootId = '', onClose }) => {
  const { t } = useTranslation();

  const [scope, setScope] = useState(initialRootId ? 'part' : 'all');
  const [rootId, setRootId] = useState(initialRootId);
  const [up, setUp] = useState(0);
  const [down, setDown] = useState('all');
  const [pageMode, setPageMode] = useState('fit');
  const [paper, setPaper] = useState('a4');
  const [orientation, setOrientation] = useState('auto');
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sortedPeople = useMemo(
    () =>
      [...people].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      ),
    [people]
  );

  const downValue = down === 'all' ? Infinity : Number(down);

  // How many people end up in the PDF
  const count = useMemo(() => {
    if (scope === 'all') return people.length;
    if (!rootId) return 0;
    return getPeopleForExport(people, { rootPersonId: rootId, up, down: downValue }).length;
  }, [people, scope, rootId, up, downValue]);

  const canCreate = !busy && count > 0 && (scope === 'all' || rootId);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await generateFamilyPdf(people, {
        scope,
        rootPersonId: rootId,
        up,
        down: downValue,
        pageMode,
        paper,
        orientation,
        photos
      });
      onClose();
    } catch (err) {
      console.error('PDF export failed:', err);
      setError(err.message || t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-content pdf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} disabled={busy}>×</button>
        <h2>{t('exportPdf', 'Export PDF')}</h2>

        {/* 1. What to include */}
        <div className="pdf-section">
          <span className="pdf-section-title">{t('pdfWhat', 'What should be included?')}</span>

          <label className={`pdf-option${scope === 'all' ? ' selected' : ''}`}>
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            <span>{t('pdfWholeTree', 'The whole tree')}</span>
          </label>

          <label className={`pdf-option${scope === 'part' ? ' selected' : ''}`}>
            <input type="radio" checked={scope === 'part'} onChange={() => setScope('part')} />
            <span>{t('pdfPartTree', 'Part of the tree around one person')}</span>
          </label>

          {scope === 'part' && (
            <div className="pdf-part-settings">
              <div className="pdf-presets">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setUp(preset.up);
                      setDown(preset.down);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="pdf-row">
                <div>
                  <label>{t('pdfPerson', 'Person')}</label>
                  <select value={rootId} onChange={(e) => setRootId(e.target.value)}>
                    <option value="">{t('pdfChoosePerson', 'Choose a person...')}</option>
                    {sortedPeople.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pdf-row">
                <div>
                  <label>{t('pdfStartAt', 'Start at')}</label>
                  <select value={up} onChange={(e) => setUp(Number(e.target.value))}>
                    {UP_LABELS.map((label, i) => (
                      <option key={i} value={i}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>{t('pdfShowDown', 'Show down to')}</label>
                  <select value={down} onChange={(e) => setDown(e.target.value)}>
                    <option value="all">{t('pdfAllBelow', 'All generations below')}</option>
                    {DOWN_LABELS.map((label, i) => (
                      <option key={i} value={String(i)}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <p className="pdf-summary">
            {count} {t('pdfPeopleIncluded', 'people will be included')}
          </p>
        </div>

        {/* 2. Pages */}
        <div className="pdf-section">
          <span className="pdf-section-title">{t('pdfPages', 'Pages')}</span>

          {PAGE_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`pdf-option${pageMode === mode.value ? ' selected' : ''}`}
            >
              <input
                type="radio"
                checked={pageMode === mode.value}
                onChange={() => setPageMode(mode.value)}
              />
              <span>
                {mode.title}
                <small>{mode.text}</small>
              </span>
            </label>
          ))}

          {pageMode !== 'fit' && (
            <div className="pdf-row">
              <div>
                <label>{t('pdfPaper', 'Paper size')}</label>
                <select value={paper} onChange={(e) => setPaper(e.target.value)}>
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                </select>
              </div>
              <div>
                <label>{t('pdfOrientation', 'Orientation')}</label>
                <select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                  <option value="auto">{t('pdfAuto', 'Automatic')}</option>
                  <option value="landscape">{t('pdfLandscape', 'Landscape')}</option>
                  <option value="portrait">{t('pdfPortrait', 'Portrait')}</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 3. Photos */}
        <div className="pdf-section">
          <label className="pdf-check">
            <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
            <span>{t('pdfPhotos', 'Include photos (slower, bigger file)')}</span>
          </label>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="pdf-actions">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={!canCreate}>
            {busy ? t('pdfCreating', 'Creating PDF...') : t('pdfCreate', 'Create PDF')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPdfModal;