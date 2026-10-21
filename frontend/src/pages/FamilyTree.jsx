import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { UnionNode, LabelNode } from '../components/TreeNodes';
import ExportPdfModal from '../components/ExportPdfModal';
import {
  normalizeRelationships,
  calculateTraditionalLayout,
  calculateModernLayout,
  findUnlinkedPeople,
  LINK_COLORS
} from '../utils/treeLayout';

const nodeTypes = {
  personNode: PersonNode,
  unionNode: UnionNode,
  labelNode: LabelNode
};

const GENDER_COLORS = { male: '#3498db', female: '#e74c3c', other: '#95a5a6' };

// Shared by both views: the family tree for the whole family or for one selected person,
// plus the people who have no links at all (shown separately)
const buildTree = (people, rootPersonId) => {
  const unlinked = findUnlinkedPeople(people);
  const unlinkedIds = new Set(unlinked.map(p => p._id));
  const linkedPeople = people.filter(p => !unlinkedIds.has(p._id));
  return {
    familyTree: calculateTraditionalLayout(linkedPeople, rootPersonId || null),
    unlinked
  };
};

const getYear = (date) => (date ? new Date(date).getFullYear() : null);

// Single person card (used in the tree and in the unlinked section)
const PersonCard = ({ person, onClick }) => (
  <div className="pedigree-card" onClick={() => onClick(person)}>
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

// Children hanging under a couple (or under one link of a person with several partners)
const ChildrenRow = ({ nodes, onPersonClick, color }) => (
  <div className="children-row" style={{ '--union-color': color || '#3498db' }}>
    <div className="children-connector-line" />
    <div className="children-container">
      {nodes.map((childNode) => (
        <FamilyNode
          key={childNode.couple[0]._id}
          familyNode={childNode}
          onPersonClick={onPersonClick}
        />
      ))}
    </div>
  </div>
);

// A person / couple / person with several partners, with all of their children underneath
const FamilyNode = ({ familyNode, onPersonClick }) => {
  const { couple, links, children } = familyNode;

  // Several partnerships: cards and links share one grid, so every group of
  // children sits exactly under the link between its two parents
  if (links.length > 1) {
    return (
      <div className="family-node-wrapper">
        <div
          className="family-grid"
          style={{ gridTemplateColumns: `repeat(${couple.length * 2 - 1}, auto)` }}
        >
          {couple.map((person, i) => {
            const link = links[i];
            const color = LINK_COLORS[i % LINK_COLORS.length];
            const hasKids = !!link && link.children.length > 0;

            return (
              <React.Fragment key={person._id}>
                <div className="grid-card" style={{ gridColumn: i * 2 + 1, gridRow: 1 }}>
                  <PersonCard person={person} onClick={onPersonClick} />
                </div>

                {link && (
                  <div
                    className="link-cell"
                    style={{
                      gridColumn: i * 2 + 2,
                      gridRow: 1,
                      '--link-color': color,
                      '--union-color': color
                    }}
                  >
                    <div className="link-horizontal" />
                    {hasKids && <div className="link-vertical" />}
                  </div>
                )}

                {hasKids && (
                  <div className="grid-children" style={{ gridColumn: i * 2 + 2, gridRow: 2 }}>
                    <ChildrenRow
                      nodes={link.children}
                      onPersonClick={onPersonClick}
                      color={color}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // One person, or one couple
  const kids = links.length === 1 ? links[0].children : children;

  return (
    <div className="family-node-wrapper">
      <div className="couple-row">
        {couple.map((person, idx) => (
          <React.Fragment key={person._id}>
            {idx > 0 && <div className="spouse-connector" />}
            <PersonCard person={person} onClick={onPersonClick} />
          </React.Fragment>
        ))}
      </div>

      {kids && kids.length > 0 && (
        <ChildrenRow nodes={kids} onPersonClick={onPersonClick} />
      )}
    </div>
  );
};

const FamilyTree = () => {
  const { t } = useTranslation();
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
      const { familyTree, unlinked } = buildTree(people, rootPersonId);
      const { nodes: flowNodes, edges: flowEdges } = calculateModernLayout(
        familyTree,
        rootPersonId ? [] : unlinked,
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
      const { familyTree, unlinked } = buildTree(people, rootPersonId);

      return (
        <div className="traditional-tree-view">
          <div className="family-tree-structure">
            {familyTree.map((familyNode) => (
              <FamilyNode
                key={familyNode.couple[0]._id}
                familyNode={familyNode}
                onPersonClick={openPerson}
              />
            ))}
          </div>

          {!rootPersonId && unlinked.length > 0 && (
            <div className="unlinked-section">
              <h3 className="generation-label">Unlinked Members</h3>
              <div className="generation-couples">
                {unlinked.map((person) => (
                  <PersonCard key={person._id} person={person} onClick={openPerson} />
                ))}
              </div>
            </div>
          )}
        </div>
      );
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
        <TransformWrapper initialScale={1} minScale={0.3} maxScale={3}>
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
                  src={photoUrl(selectedPerson.photo)}
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
              <div className="modal-actions">
                <button className="btn-primary">
                  {t('edit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyTree;