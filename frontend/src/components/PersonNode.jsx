import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { IMAGE_BASE_URL } from '../api';

// The handles are only anchor points for the lines, so they are invisible
const hidden = { opacity: 0, pointerEvents: 'none' };

const PersonNode = ({ data }) => {
  const { person } = data;
  const genderColor =
    person.gender === 'male' ? '#3498db' : person.gender === 'female' ? '#e74c3c' : '#95a5a6';

  const birthYear = person.birthDate ? new Date(person.birthDate).getFullYear() : '?';
  const deathYear = person.deathDate ? new Date(person.deathDate).getFullYear() : '';
  const lifespan = deathYear ? `${birthYear} - ${deathYear}` : `b. ${birthYear}`;

  return (
    <div
      className={`person-node${person.deathDate ? ' person-node--deceased' : ''}`}
      style={{
        width: 200,
        minHeight: 96,
        display: 'flex',
        alignItems: 'center',
        borderColor: genderColor,
        boxShadow: `0 4px 12px ${genderColor}40`
      }}
    >
      {/* top: from the parents. bottom: to the children (single parent).
          left/right: to a partner's union dot. The ids are used by the lines. */}
      <Handle id="top" type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={hidden} isConnectable={false} />
      <Handle id="left-source" type="source" position={Position.Left} style={hidden} isConnectable={false} />
      <Handle id="right-source" type="source" position={Position.Right} style={hidden} isConnectable={false} />

      <div className="person-node-content" style={{ minWidth: 0, width: '100%' }}>
        {person.photo && (
          <img
            src={`${IMAGE_BASE_URL}${person.photo}`}
            alt={`${person.firstName} ${person.lastName}`}
            className="person-node-photo"
          />
        )}
        <div className="person-node-info" style={{ minWidth: 0 }}>
          <h4
            className="person-node-name"
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {person.firstName} {person.lastName}
          </h4>
          <p className="person-node-lifespan">{lifespan}</p>
          <div
            className="person-node-gender-indicator"
            style={{ backgroundColor: genderColor }}
          />
        </div>
      </div>
    </div>
  );
};

export default memo(PersonNode);