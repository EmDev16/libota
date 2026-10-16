import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  normalizeRelationships,
  calculateGenerationalLevels,
  calculateXYFlowLayout,
  calculateTraditionalLayout,
  findUnlinkedPeople
} from '../utils/treeLayout';

const nodeTypes = {
  personNode: PersonNode,
};

const getYear = (date) => (date ? new Date(date).getFullYear() : null);

// Single person card (used in the tree and in the unlinked section)
const PersonCard = ({ person, onClick }) => (
  <div className="pedigree-card" onClick={() => onClick(person)}>
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

// A couple with all of their children underneath (recursive)
const FamilyNode = ({ familyNode, onPersonClick }) => {
  const { couple, children } = familyNode;

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

      {children && children.length > 0 && (
        <div className="children-row">
          <div className="children-connector-line" />
          <div className="children-container">
            {children.map((childNode) => (
              <FamilyNode
                key={childNode.couple[0]._id}
                familyNode={childNode}
                onPersonClick={onPersonClick}
              />
            ))}
          </div>
        </div>
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

  // XYFlow state for modern view
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (people.length > 0 && treeStyle === 'modern') {
      const levels = calculateGenerationalLevels(people);
      const { nodes: flowNodes, edges: flowEdges } = calculateXYFlowLayout(people, levels);
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [people, treeStyle, setNodes, setEdges]);

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

      {treeStyle === 'traditional' && people.length > 0 && (
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

      {treeStyle === 'modern' && (
        <button className="btn-secondary" onClick={() => window.location.reload()}>
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
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
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
      const familyTree = calculateTraditionalLayout(people, rootPersonId || null);
      const unlinked = findUnlinkedPeople(people);

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

          {unlinked.length > 0 && (
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