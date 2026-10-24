import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { treeAPI } from '../api';
import { photoUrl } from '../utils/photo';
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
import { familyOptions, oldestOfFamily } from '../utils/families';
import { formatDate, localToday } from '../utils/dates';
import { birthdayBadge } from '../utils/birthdays';

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
const PersonCard = ({ person, onClick, style, focused }) => {
  const badge = birthdayBadge(person, localToday());
  return (
  <div className={`pedigree-card${focused ? ' pedigree-focus' : ''}`} style={style} onClick={() => onClick(person)}>
    {badge && (
      <span className="birthday-badge" title={badge.title} aria-label={badge.title}>
        {badge.emoji}
      </span>
    )}
    {person.photo && (
      <img
        src={photoUrl(person.photo)}
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
};

// The traditional view: the same positions as the modern view (every person once, parents above,
// partners side by side), drawn as cards with square lines
const TraditionalTree = ({ layout, onPersonClick, focusId }) => {
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
              id={`person-${node.data.person._id}`}
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
                focused={node.data.person._id === focusId}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showModal, setShowModal] = useState(false);
  // Phones start with the traditional view, computers with the modern one (the person can switch)
  const [treeStyle, setTreeStyle] = useState(isPhone ? 'traditional' : 'modern');
  const [fitKey, setFitKey] = useState(0); // bump to re-fit the modern view
  const [family, setFamily] = useState(''); // '' = the whole tree, or "word:mbala" / "full:mbala venia"
  const [focusId, setFocusId] = useState(null); // the person the view is centred on
  const [showPdfModal, setShowPdfModal] = useState(false);
  const transform = useRef(null);
  const flowInstance = useRef(null);

  // XYFlow state for the modern view
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    loadTree();
  }, []);

  const families = useMemo(() => familyOptions(people), [people]);
  // "Mbala": the oldest Mbala, and everybody who descends from them
  const familyRoot = useMemo(() => (family ? oldestOfFamily(people, family) : null), [people, family]);
  const rootPersonId = familyRoot ? familyRoot._id : '';

  const layout = useMemo(() => {
    if (people.length === 0) return null;
    try {
      return calculateGraphLayoutFor(people, rootPersonId, t('unlinkedMembers', 'Unlinked Members'), {
        descendantsOnly: !!rootPersonId
      });
    } catch (error) {
      console.error('Error rendering tree:', error);
      return { error };
    }
  }, [people, rootPersonId, t]);

  useEffect(() => {
    if (layout && !layout.error && treeStyle === 'modern') {
      setNodes(layout.nodes);
      setEdges(layout.edges);
    }
  }, [layout, treeStyle, setNodes, setEdges]);

  // Coming from the search box or the timeline (/tree?person=<id>): show the whole tree centred on that person
  const personFromLink = searchParams.get('person');
  useEffect(() => {
    if (!personFromLink || people.length === 0) return;
    const found = people.find((p) => String(p._id) === personFromLink);
    if (found) {
      setFamily('');
      setFocusId(found._id);
    }
    setSearchParams({}, { replace: true });
  }, [personFromLink, people, setSearchParams]);

  // Move the view to the person once the tree is on screen, and let the card shine for a moment
  useEffect(() => {
    if (!focusId || !layout || layout.error) return undefined;
    const move = setTimeout(() => {
      if (treeStyle === 'modern') {
        const node = layout.nodes.find((n) => n.type === 'personNode' && n.data.person._id === focusId);
        const flow = flowInstance.current;
        if (node && flow) {
          const { NODE_W, NODE_H } = MODERN_SIZES;
          flow.setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
            zoom: isPhone ? 0.8 : 1,
            duration: 500
          });
        }
      } else {
        const api = transform.current;
        if (api && api.zoomToElement) api.zoomToElement(`person-${focusId}`, isPhone ? 0.7 : 1, 500);
      }
    }, 450);
    const stop = setTimeout(() => setFocusId(null), 4000);
    return () => {
      clearTimeout(move);
      clearTimeout(stop);
    };
  }, [focusId, layout, treeStyle]);

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

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedPerson(null);
  };

  // Top bar: pick a family (last name), export, reset the view
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
          <label htmlFor="family-select">{t('viewFrom')}:</label>
          <select
            id="family-select"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="root-select"
          >
            <option value="">{t('entireTree')}</option>
            {families.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} ({f.count})
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

      {people.length > 0 && (
        <button
          className="btn-secondary"
          onClick={() =>
            treeStyle === 'modern'
              ? setFitKey((k) => k + 1)
              : transform.current && transform.current.resetTransform()
          }
        >
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

  const hasParents = selectedPerson && (selectedPerson.parents || []).length > 0;

  return (
    <div className="family-tree">
      {renderControls()}

      {layout && layout.error ? (
        <div className="error">Error rendering tree: {layout.error.message}</div>
      ) : treeStyle === 'modern' ? (
        <div className="modern-tree-view">
          <ReactFlow
            // new key = the view is re-fitted (tree changed, or "reset" was clicked)
            key={`${rootPersonId || 'all'}-${fitKey}-${nodes.length}`}
            nodes={nodes.map((n) =>
              n.type === 'personNode' && n.data.person._id === focusId
                ? { ...n, className: 'flow-focus' }
                : n
            )}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(event, node) => {
              if (node.type !== 'personNode') return; // dots and labels are not clickable
              openPerson(node.data.person);
            }}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
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
      ) : (
        // on a phone the tree starts zoomed out, and can be pinched out further
        <TransformWrapper
          ref={transform}
          initialScale={isPhone ? 0.5 : 1}
          minScale={isPhone ? 0.15 : 0.3}
          maxScale={3}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
            <TraditionalTree layout={layout} onPersonClick={openPerson} focusId={focusId} />
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
                  src={photoUrl(selectedPerson.photo)}
                  alt={`${selectedPerson.firstName} ${selectedPerson.lastName}`}
                  className="modal-photo"
                />
              )}
              <h2>{selectedPerson.firstName} {selectedPerson.lastName}</h2>
              <div className="modal-info">
                <p><strong>{t('birthDate')}:</strong> {formatDate(selectedPerson.birthDate, '-')}</p>
                <p><strong>{t('deathDate')}:</strong> {formatDate(selectedPerson.deathDate, '-')}</p>
                <p><strong>{t('gender')}:</strong> {t(selectedPerson.gender)}</p>
                {selectedPerson.description && (
                  <p><strong>{t('description')}:</strong> {selectedPerson.description}</p>
                )}
              </div>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => navigate(`/gallery?person=${selectedPerson._id}`)}
                >
                  {t('galleryPhotosLink')}
                </button>
                {isAdmin && (
                  <>
                    {hasParents && (
                      <button
                        className="btn-secondary"
                        onClick={() => navigate(`/people/new?siblingOf=${selectedPerson._id}`)}
                      >
                        {t('addSibling')}
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      onClick={() => navigate(`/people/new?childOf=${selectedPerson._id}`)}
                    >
                      {t('addChild')}
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => navigate(`/people/${selectedPerson._id}/edit`)}
                    >
                      {t('edit')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyTree;