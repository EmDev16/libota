import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Choosing a photo of a person: the site always shows it as a square, so before it is kept the person
// moves and zooms the photo inside that square. What is inside the frame is what everybody will see.
const OUTPUT = 900; // largest side, in pixels, of the saved square

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const Cropper = ({ file, onDone, onCancel }) => {
  const { t } = useTranslation();
  const [src, setSrc] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // top-left of the photo inside the frame, in frame pixels
  const frame = useRef(Math.max(220, Math.min(320, window.innerWidth - 100))).current;
  const drag = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = size.w ? Math.max(frame / size.w, frame / size.h) : 1; // the photo just covers the frame
  const scale = base * zoom;

  const place = (x, y, sc) => ({
    x: clamp(x, frame - size.w * sc, 0),
    y: clamp(y, frame - size.h * sc, 0)
  });

  const onLoad = (e) => {
    const w = e.target.naturalWidth;
    const h = e.target.naturalHeight;
    const cover = Math.max(frame / w, frame / h);
    setSize({ w, h });
    setPos({ x: (frame - w * cover) / 2, y: (frame - h * cover) / 2 }); // starts centred
  };

  // A photo the browser cannot show (for example some phone formats): keep it exactly as it is
  const onError = () => onDone(file);

  const onPointerDown = (e) => {
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos(place(drag.current.x + e.clientX - drag.current.px, drag.current.y + e.clientY - drag.current.py, scale));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const changeZoom = (value) => {
    const next = base * value;
    // keep the middle of the frame where it is
    const cx = (frame / 2 - pos.x) / scale;
    const cy = (frame / 2 - pos.y) / scale;
    setZoom(value);
    setPos(place(frame / 2 - cx * next, frame / 2 - cy * next, next));
  };

  const confirm = () => {
    const img = imageRef.current;
    if (!img || !size.w) return;
    const side = frame / scale; // the square, in pixels of the original photo
    const out = Math.round(Math.min(OUTPUT, side));
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d').drawImage(img, -pos.x / scale, -pos.y / scale, side, side, 0, 0, out, out);
    canvas.toBlob(
      (blob) => {
        if (!blob) return onDone(file);
        const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
        onDone(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true">
      <div className="dialog-card crop-card">
        <h3 className="crop-title">{t('cropTitle')}</h3>
        <p className="crop-help">{t('cropHelp')}</p>
        <div
          className="crop-frame"
          style={{ width: frame, height: frame }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {src && (
            <img
              ref={imageRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={onLoad}
              onError={onError}
              style={{
                width: size.w ? size.w * scale : 'auto',
                height: size.h ? size.h * scale : 'auto',
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                visibility: size.w ? 'visible' : 'hidden'
              }}
            />
          )}
          <span className="crop-grid" aria-hidden="true" />
        </div>
        <label className="crop-zoom">
          <span>{t('cropZoom')}</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={!size.w}>
            {t('cropUse')}
          </button>
        </div>
      </div>
    </div>
  );
};

// Drop-in for <input type="file">: onChange gets the (cropped) file, or null when it is cleared.
const CropPhotoInput = ({ onChange, inputRef }) => {
  const [pending, setPending] = useState(null);
  const localRef = useRef(null);
  const setRef = (el) => {
    localRef.current = el;
    if (typeof inputRef === 'function') inputRef(el);
    else if (inputRef) inputRef.current = el;
  };

  const reset = () => {
    if (localRef.current) localRef.current.value = '';
  };

  return (
    <>
      <input
        ref={setRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files[0] || null;
          if (file) setPending(file);
          else onChange(null);
        }}
      />
      {pending && (
        <Cropper
          file={pending}
          onCancel={() => {
            setPending(null);
            reset();
          }}
          onDone={(result) => {
            setPending(null);
            onChange(result);
          }}
        />
      )}
    </>
  );
};

export default CropPhotoInput;
