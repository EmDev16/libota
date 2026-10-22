import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { treeAPI, IMAGE_BASE_URL } from '../api';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PersonNode from '../components/PersonNode';
import { UnionNode, LabelNode, BusEdge } from '../components/TreeNodes';
import ExportPdfModal from '../components/ExportPdfModal';
import { normalizeRelationships, MODERN_SIZES } from '../utils/treeLayout';
import { calculateGraphLayoutFor } from '../utils/graphLayout';

const nodeTypes = {
  personNode: PersonNode,
  unionNode: UnionNode,
  labelNode: LabelNode
};

const edgeTypes = { busEdge: BusEdge };

const GENDER_COLORS = { male: '#3498db', female: '#e74c3c', other: '#95a5a6' };

const isPhone = typeof window !== 'undefined' && window.innerWidth < 600;

const getYear = (date) => (date ? new Date(date).getFullYear() : null);

// Single person card (used in the tree and in the unlinked section)
const PersonCard = ({ person, onClick, style }) => (
  <div className="pedigree-card" style={style} onClick={() => onClick(person)}>
    {person.photo && (
      <img
        src={`${IMAGE_BASE_URL}${person.photo}`}
        alt={`${person.firstName} ${person.lastName}`}
        className="pedigree-photo"
      />
    )}
    <div className="pedigree-info">
      <h4>{person.firstName} {person.lastName}</h4>
      <p className="pedigree-lifespan">
        {getYear(person.birthDate) || '?'}
        {person.deathDate ? ` - ${getYear(person.deathDate)}` : ''}
      </p>
    </div>
  </div>
);

// The traditional view: the same positions as the modern view (every person once, parents above,
// partners side by side), drawn as cards with square lines
const TraditionalTree = ({ layout, onPersonClick }) => {
  const PAD = 40;
  const { nodes, geometry, size } = layout;
  const { NODE_W, NODE_H, ROW_GAP } = MODERN_SIZES;

  return (
    <div className="traditional-tree-view">
      <div
        className="family-tree-structure"
        style={{ position: 'relative', width: size.width + PAD * 2, height: size.height + PAD * 2 }}
      >
        <svg
          width={size.width + PAD * 2}
          height={size.height + PAD * 2}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          <g transform={`translate(${PAD},${PAD})`} fill="none" strokeLinejoin="round">
            {geometry.children.map((line, i) => {
              const midY = line.busY ?? line.to.y - ROW_GAP / 2;
              return (
                <path
                  key={i}
                  d={`M ${line.from.x} ${line.from.y} V ${midY} H ${line.to.x} V ${line.to.y}`}
                  stroke={line.color}
                  strokeWidth="2"
                />
              );
            })}
            {geometry.unions.map((u) => (
              <g key={u.id}>
                {u.around ? (
                  <path
                    d={`M ${u.around[0].x} ${u.around[0].y} V ${u.dot.y} H ${u.around[1].x} V ${u.around[1].y}`}
                    stroke={u.color}
                    strokeWidth="3"
                    strokeDasharray={u.ended ? '8 5' : undefined}
                  />
                ) : (
                  <line
                    x1={u.from.x}
                    y1={u.from.y}
                    x2={u.to.x}
                    y2={u.to.y}
                    stroke={u.color}
                    strokeWidth="3"
                    strokeDasharray={u.ended ? '8 5' : undefined}
                  />
                )}
                <circle
                  cx={u.dot.x}
                  cy={u.dot.y}
                  r="7"
                  fill={u.ended ? '#fff' : u.color}
                  stroke={u.ended ? u.color : '#fff'}
                  strokeWidth="2"
                />
              </g>
            ))}
          </g>
        </svg>

        {nodes.map((node) => {
          if (node.type === 'labelNode') {
            return (
              <h3
                key={node.id}
                className="generation-label"
                style={{ position: 'absolute', left: node.position.x + PAD, top: node.position.y + PAD, margin: 0 }}
              >
                {node.data.label}
              </h3>
            );
          }
          if (node.type !== 'personNode') return null;
          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.position.x + PAD,
                top: node.position.y + PAD,
                width: NODE_W,
                height: NODE_H
              }}
            >
              <PersonCard
                person={node.data.person}
                onClick={onPersonClick}
                style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FamilyTree = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treeStyle, setTreeStyle] = useState('traditional');
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [rootPersonId, setRootPersonId] = useState('');
  const [fitKey, setFitKey] = useState(0); // bump to re-fit the modern view
  const [showPdfModal, setShowPdfModal] = useState(false);

  // XYFlow state for modern view
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (people.length > 0 && treeStyle === 'modern') {
      const { nodes: flowNodes, edges: flowEdges } = calculateGraphLayoutFor(
        people,
        rootPersonId,
        t('unlinkedMembers', 'Unlinked Members')
      );
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [people, treeStyle, rootPersonId, setNodes, setEdges, t]);

  const loadTree = async () => {
    try {
      const response = await treeAPI.getComplete();
      // Clean up ids and make parent/child/spouse links two-way
      setPeople(normalizeRelationships(response.data));
    } catch (error) {
      console.error('Error loading tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const openPerson = (person) => {
    setSelectedPerson(person);
    setShowModal(true);
  };

  const handleNodeClick = useCallback((event, node) => {
    if (node.type !== 'personNode') return; // dots and labels are not clickable
    setSelectedPerson(node.data.person);
    setShowModal(true);
  }, []);

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedPerson(null);
  };

  // Top bar: style select, root selector (traditional view only), reset zoom (modern view only)
  const renderControls = () => (
    <div className="tree-controls">
      <select
        value={treeStyle}
        onChange={(e) => setTreeStyle(e.target.value)}
        className="tree-style-select"
      >
        <option value="traditional">{t('traditional')}</option>
        <option value="modern">{t('modern')}</option>
      </select>

      {people.length > 0 && (
        <div className="root-selector-inline">
          <label>{t('viewFrom')}:</label>
          <select
            value={rootPersonId}
            onChange={(e) => setRootPersonId(e.target.value)}
            className="root-select"
          >
            <option value="">{t('entireTree')}</option>
            {people.map(person => (
              <option key={person._id} value={person._id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      {people.length > 0 && (
        <button className="btn-secondary" onClick={() => setShowPdfModal(true)}>
          {t('exportPdf', 'Export PDF')}
        </button>
      )}

      {treeStyle === 'modern' && (
        <button className="btn-secondary" onClick={() => setFitKey(k => k + 1)}>
          {t('resetZoom')}
        </button>
      )}
    </div>
  );

  if (loading) {
    return <div className="loading">{t('loading')}</div>;
  }

  if (people.length === 0) {
    return (
      <div className="family-tree">
        {renderControls()}
        <div className="no-data">{t('noData')}</div>
      </div>
    );
  }

  const renderModernView = () => {
    try {
      return (
        <div className="modern-tree-view">
          <ReactFlow
            // new key = the view is re-fitted (tree changed, or "reset" was clicked)
            key={`${rootPersonId || 'all'}-${fitKey}-${nodes.length}`}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesConnectable={false}
            minZoom={0.1}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            attributionPosition="bottom-left"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeStrokeWidth={3}
              nodeColor={(n) =>
                n.type === 'personNode'
                  ? GENDER_COLORS[n.data.person.gender] || GENDER_COLORS.other
                  : 'transparent'
              }
              zoomable
              pannable
            />
          </ReactFlow>
        </div>
      );
    } catch (error) {
      console.error('Error rendering modern view:', error);
      return <div className="error">Error rendering modern view: {error.message}</div>;
    }
  };

  const renderTraditionalView = () => {
    try {
      const layout = calculateGraphLayoutFor(people, rootPersonId, t('unlinkedMembers', 'Unlinked Members'));
      return <TraditionalTree layout={layout} onPersonClick={openPerson} />;
    } catch (error) {
      console.error('Error rendering traditional view:', error);
      return <div className="error">Error rendering tree: {error.message}</div>;
    }
  };

  return (
    <div className="family-tree">
      {renderControls()}

      {treeStyle === 'modern' ? (
        renderModernView()
      ) : (
        // on a phone the tree starts zoomed out, and can be pinched out further
        <TransformWrapper
          initialScale={isPhone ? 0.5 : 1}
          minScale={isPhone ? 0.15 : 0.3}
          maxScale={3}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
            {renderTraditionalView()}
          </TransformComponent>
        </TransformWrapper>
      )}

      {/* PDF export */}
      {showPdfModal && (
        <ExportPdfModal
          people={people}
          initialRootId={rootPersonId}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {/* Person Details Modal */}
      {showModal && selectedPerson && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={handleCloseModal}>×</button>
            <div className="person-details">
              {selectedPerson.photo && (
                <img
                  src={`${IMAGE_BASE_URL}${selectedPerson.photo}`}
                  alt={`${selectedPerson.firstName} ${selectedPerson.lastName}`}
                  className="modal-photo"
                />
              )}
              <h2>{selectedPerson.firstName} {selectedPerson.lastName}</h2>
              <div className="modal-info">
                <p><strong>{t('birthDate')}:</strong> {selectedPerson.birthDate ? new Date(selectedPerson.birthDate).toLocaleDateString() : '-'}</p>
                <p><strong>{t('deathDate')}:</strong> {selectedPerson.deathDate ? new Date(selectedPerson.deathDate).toLocaleDateString() : '-'}</p>
                <p><strong>{t('gender')}:</strong> {t(selectedPerson.gender)}</p>
                {selectedPerson.description && (
                  <p><strong>{t('description')}:</strong> {selectedPerson.description}</p>
                )}
              </div>
              {isAdmin && (
                <div className="modal-actions">
                  <button
                    className="btn-primary"
                    onClick={() => navigate(`/people/${selectedPerson._id}/edit`)}
                  >
                    {t('edit')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyTree;