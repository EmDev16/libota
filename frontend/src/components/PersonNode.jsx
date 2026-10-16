import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { IMAGE_BASE_URL } from '../api';

const PersonNode = ({ data }) => {
  const { person } = data;
  const genderColor = person.gender === 'male' ? '#3498db' : person.gender === 'female' ? '#e74c3c' : '#95a5a6';
  
  const birthYear = person.birthDate ? new Date(person.birthDate).getFullYear() : '?';
  const deathYear = person.deathDate ? new Date(person.deathDate).getFullYear() : '';
  const lifespan = deathYear ? `${birthYear} - ${deathYear}` : `b. ${birthYear}`;

  return (
    <div 
      className="person-node"
      style={{ 
        borderColor: genderColor,
        boxShadow: `0 4px 12px ${genderColor}40`
      }}
    >
      {/* Top handle for parent connections */}
      <Handle type="target" position={Position.Top} className="node-handle" />
      
      {/* Left handle for spouse connections */}
      <Handle type="source" position={Position.Left} className="node-handle" />
      
      {/* Right handle for spouse connections */}
      <Handle type="source" position={Position.Right} className="node-handle" />
      
      {/* Bottom handle for child connections */}
      <Handle type="source" position={Position.Bottom} className="node-handle" />
      
      <div className="person-node-content">
        {person.photo && (
          <img
            src={`${IMAGE_BASE_URL}${person.photo}`}
            alt={`${person.firstName} ${person.lastName}`}
            className="person-node-photo"
          />
        )}
        <div className="person-node-info">
          <h4 className="person-node-name">
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

export default PersonNode;
