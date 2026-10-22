import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { IMAGE_BASE_URL } from '../api';
import { birthdayBadge } from '../utils/birthdays';
import { localToday } from '../utils/dates';

// The handles are only anchor points for the lines, so they are invisible
const hidden = { opacity: 0, pointerEvents: 'none' };

const PersonNode = ({ data }) => {
  const { person, reference } = data;
  const genderColor =
    person.gender === 'male' ? '#3498db' : person.gender === 'female' ? '#e74c3c' : '#95a5a6';

  const birthYear = person.birthDate ? new Date(person.birthDate).getFullYear() : '?';
  const deathYear = person.deathDate ? new Date(person.deathDate).getFullYear() : '';
  const badge = birthdayBadge(person, localToday());
  const lifespan = deathYear ? `${birthYear} - ${deathYear}` : `b. ${birthYear}`;

  return (
    <div
      className={`person-node${person.deathDate ? ' person-node--deceased' : ''}${reference ? ' person-node--reference' : ''}`}
      style={{
        width: 200,
        minHeight: 96,
        display: 'flex',
        alignItems: 'center',
        borderColor: genderColor,
        borderStyle: reference ? 'dashed' : undefined,
        opacity: reference ? 0.75 : 1,
        boxShadow: `0 4px 12px ${genderColor}40`
      }}
    >
      {/* top: from the parents. bottom: to the children (single parent).
          left/right: to a partner's union dot. The ids are used by the lines. */}
      <Handle id="top" type="target" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={hidden} isConnectable={false} />
      <Handle id="left-source" type="source" position={Position.Left} style={hidden} isConnectable={false} />
      <Handle id="right-source" type="source" position={Position.Right} style={hidden} isConnectable={false} />

      {badge && (
        <span className="birthday-badge" title={badge.title} aria-label={badge.title}>
          {badge.emoji}
        </span>
      )}

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
          {reference && (
            <p className="person-node-lifespan" style={{ fontStyle: 'italic' }}>
              also shown in another branch
            </p>
          )}
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