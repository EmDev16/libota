import React from 'react';
import { BaseEdge, Handle, Position } from '@xyflow/react';

const hidden = { opacity: 0, pointerEvents: 'none' };

// Small dot between two partners; the line to their children starts here
export const UnionNode = ({ data }) => (
  <div
    style={{
      width: 14,
      height: 14,
      borderRadius: '50%',
      // an ended relationship is an empty dot
      background: data.ended ? '#fff' : data.color,
      border: data.ended ? `2px solid ${data.color}` : '2px solid #fff',
      boxShadow: data.ended ? 'none' : '0 0 0 1px rgba(0, 0, 0, 0.15)'
    }}
  >
    <Handle id="left" type="target" position={Position.Left} style={hidden} isConnectable={false} />
    <Handle id="right" type="target" position={Position.Right} style={hidden} isConnectable={false} />
    <Handle id="bottom" type="source" position={Position.Bottom} style={hidden} isConnectable={false} />
  </div>
);

// Plain text heading inside the canvas (used for the "Unlinked Members" row)
export const LabelNode = ({ data }) => (
  <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#2c3e50', whiteSpace: 'nowrap' }}>
    {data.label}
  </div>
);

// The line from a family down to one child: straight down from the parents, along the family's
// own horizontal line (data.busY, a height chosen by the layout so that families do not
// overlap), then down into the child. The corners are rounded.
export const BusEdge = ({ sourceX, sourceY, targetX, targetY, data, style }) => {
  const busY = data?.busY ?? (sourceY + targetY) / 2;
  const dx = targetX - sourceX;

  let path;
  if (Math.abs(dx) < 1) {
    path = `M ${sourceX} ${sourceY} V ${targetY}`;
  } else {
    const dir = dx > 0 ? 1 : -1;
    const r = Math.max(0, Math.min(8, Math.abs(dx) / 2, busY - sourceY, targetY - busY));
    path =
      `M ${sourceX} ${sourceY} V ${busY - r} ` +
      `Q ${sourceX} ${busY} ${sourceX + dir * r} ${busY} ` +
      `H ${targetX - dir * r} ` +
      `Q ${targetX} ${busY} ${targetX} ${busY + r} V ${targetY}`;
  }

  return <BaseEdge path={path} style={style} />;
};