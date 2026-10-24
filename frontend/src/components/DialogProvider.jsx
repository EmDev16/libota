import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// In-app replacements for window.confirm / alert / prompt, in the style of the site.
//   const dialog = useDialog();
//   if (await dialog.confirm('Delete?', { danger: true })) ...
//   await dialog.alert('Done');
//   const text = await dialog.prompt('New password', { password: true });   // null when cancelled
const DialogContext = createContext(null);

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog needs a DialogProvider');
  return ctx;
};

export const DialogProvider = ({ children }) => {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');
  const resolver = useRef(null);

  const open = useCallback(
    (d) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setText('');
        setDialog(d);
      }),
    []
  );

  const finish = useCallback((value) => {
    setDialog(null);
    if (resolver.current) resolver.current(value);
    resolver.current = null;
  }, []);

  const api = useMemo(
    () => ({
      confirm: (message, opts = {}) => open({ kind: 'confirm', message, ...opts }),
      alert: (message, opts = {}) => open({ kind: 'alert', message, ...opts }),
      prompt: (message, opts = {}) => open({ kind: 'prompt', message, ...opts })
    }),
    [open]
  );

  const cancel = useCallback(() => {
    if (!dialog) return;
    finish(dialog.kind === 'prompt' ? null : false);
  }, [dialog, finish]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, cancel]);

  const submit = (e) => {
    e.preventDefault();
    if (!dialog) return;
    if (dialog.kind === 'prompt') finish(text);
    else finish(true);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <div className="dialog-overlay" onClick={cancel} role="presentation">
          <form className="dialog-card" role="dialog" aria-modal="true" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <p className="dialog-message">{dialog.message}</p>
            {dialog.kind === 'prompt' && (
              <input
                className="dialog-input"
                type={dialog.password ? 'password' : 'text'}
                value={text}
                autoFocus
                autoComplete={dialog.password ? 'new-password' : 'off'}
                onChange={(e) => setText(e.target.value)}
              />
            )}
            <div className="dialog-actions">
              {dialog.kind !== 'alert' && (
                <button type="button" className="btn-secondary" onClick={cancel}>
                  {dialog.cancelLabel || t('cancel')}
                </button>
              )}
              <button
                type="submit"
                className={dialog.danger ? 'btn-danger' : 'btn-primary'}
                autoFocus={dialog.kind !== 'prompt'}
              >
                {dialog.okLabel || (dialog.kind === 'confirm' && dialog.danger ? t('delete') : t('dialogOk'))}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
};
