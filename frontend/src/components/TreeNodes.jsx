import React from 'react';
import { Handle, Position } from '@xyflow/react';

const hidden = { opacity: 0, pointerEvents: 'none' };

// Small dot between two partners; the line to their children starts here
export const UnionNode = ({ data }) => (
  <div
    style={{
      width: 14,
      height: 14,
      borderRadius: '50%',
      background: data.color,
      border: '2px solid #fff',
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.15)'
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