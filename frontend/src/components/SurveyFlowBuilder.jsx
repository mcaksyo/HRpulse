import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
} from '@xyflow/react';
import { ArrowDown, ArrowUp, GitBranchPlus, Route, Trash2, WandSparkles } from 'lucide-react';
import Button from './Button.jsx';
import { questionsAPI } from '../services/api.js';
import '@xyflow/react/dist/style.css';
import './SurveyFlowBuilder.css';

const FLOW_STORAGE_PREFIX = 'pulsehr-flow-layout-v2';
const FLOW_NODE_TYPES = {
  surveyQuestion: SurveyQuestionNode,
};
const FIT_VIEW_OPTIONS = {
  padding: 0.16,
  minZoom: 0.5,
  maxZoom: 1.2,
};

function normalizeQuestionType(type) {
  const value = String(type || '').toLowerCase();

  if (value === 'single_choice' || value === 'single') {
    return 'single';
  }

  if (value === 'multiple_choice' || value === 'multiple') {
    return 'multiple';
  }

  if (value === 'scale' || value === 'rating') {
    return 'scale';
  }

  if (value === 'matrix') {
    return 'matrix';
  }

  return value || 'text';
}

function getQuestionTypeLabel(type) {
  const normalized = normalizeQuestionType(type);

  if (normalized === 'single') {
    return 'Одиночный выбор';
  }

  if (normalized === 'multiple') {
    return 'Множественный выбор';
  }

  if (normalized === 'scale') {
    return 'Шкала / рейтинг';
  }

  if (normalized === 'matrix') {
    return 'Матричный вопрос';
  }

  return 'Текстовый ответ';
}

function getBranchValueOptions(question) {
  const normalizedType = normalizeQuestionType(question?.type);

  if (normalizedType === 'single' || normalizedType === 'multiple') {
    return Array.isArray(question?.options)
      ? [...new Set(question.options.map((item) => String(item)))]
      : [];
  }

  if (normalizedType === 'scale') {
    const min = Number(question?.scale_min ?? question?.scaleMin ?? 1);
    const max = Number(question?.scale_max ?? question?.scaleMax ?? 10);

    return Array.from({ length: max - min + 1 }, (_, index) => String(min + index));
  }

  return [];
}

function getDefaultNextQuestion(questionId, questions) {
  const currentIndex = questions.findIndex((item) => item.id === questionId);
  return currentIndex >= 0 ? questions[currentIndex + 1] || null : null;
}

function getFallbackPosition(index) {
  return {
    x: 48 + (index % 3) * 360,
    y: 48 + Math.floor(index / 3) * 280,
  };
}

function getStorageKey(surveyId) {
  return `${FLOW_STORAGE_PREFIX}:${surveyId}`;
}

function readStoredLayout(surveyId) {
  try {
    return JSON.parse(window.localStorage.getItem(getStorageKey(surveyId)) || '{}');
  } catch {
    return {};
  }
}

function writeStoredLayout(surveyId, nodes) {
  try {
    const layout = Object.fromEntries(
      nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );

    window.localStorage.setItem(getStorageKey(surveyId), JSON.stringify(layout));
  } catch {
    // Layout persistence is best-effort only.
  }
}

function encodeBranchValue(value) {
  return encodeURIComponent(String(value ?? ''));
}

function decodeBranchHandle(sourceHandle) {
  if (!sourceHandle || !sourceHandle.startsWith('branch::')) {
    return '';
  }

  return decodeURIComponent(sourceHandle.slice('branch::'.length));
}

function getEdgeId(questionId, conditionValue) {
  return `branch-${questionId}-${encodeBranchValue(conditionValue)}`;
}

function getActionLabel(action) {
  const labels = {
    skip_to: 'GoTo',
    show: 'Показать',
    hide: 'Скрыть',
  };

  return labels[String(action || '').toLowerCase()] || 'GoTo';
}

function getActionColor(action) {
  const value = String(action || '').toLowerCase();

  if (value === 'show') {
    return '#14b86f';
  }

  if (value === 'hide') {
    return '#475569';
  }

  return '#e91428';
}

function SurveyQuestionNode({ data, selected }) {
  return (
    <div className={`survey-flow-node ${selected ? 'survey-flow-node--selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="survey-flow-node__socket" />
      <Handle
        type="source"
        id="default"
        position={Position.Bottom}
        isConnectable={false}
        className="survey-flow-node__socket survey-flow-node__socket--default"
      />

      <div className="survey-flow-node__header">
        <div>
          <div className="survey-flow-node__eyebrow">Вопрос {data.index + 1}</div>
          <strong>{data.question.text}</strong>
        </div>
        <div className="survey-flow-node__tags">
          <span>{data.typeLabel}</span>
          {data.question.required ? <span>Обязательный</span> : null}
        </div>
      </div>

      <div className="survey-flow-node__default">
        <span>Основной ход</span>
        <strong>{data.defaultTargetLabel || 'Завершение опроса'}</strong>
      </div>

      <div className="survey-flow-node__branches">
        <div className="survey-flow-node__branch-title">
          <GitBranchPlus size={14} />
          <span>Частные переходы по ответам</span>
        </div>

        {data.branchOptions.length ? (
          data.branchOptions.map((option, optionIndex) => {
            const isActive = data.activeBranchValues.includes(String(option));
            const isSelected = data.selectedBranchValue === String(option);

            return (
              <div
                key={`${data.question.id}-${option}-${optionIndex}`}
                className={`survey-flow-node__branch-row ${isActive ? 'survey-flow-node__branch-row--active' : ''} ${isSelected ? 'survey-flow-node__branch-row--selected' : ''}`}
              >
                <div>
                  <strong>{option}</strong>
                  <span>{isActive ? 'Стрелка уже настроена' : 'Потяните стрелку к нужному вопросу'}</span>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`branch::${encodeBranchValue(option)}`}
                  className="survey-flow-node__socket survey-flow-node__socket--branch"
                />
              </div>
            );
          })
        ) : (
          <div className="survey-flow-node__empty">
            Для текстовых вопросов ветвление на холсте не задаётся.
          </div>
        )}
      </div>

      <div className="survey-flow-node__actions">
        <button type="button" onClick={() => data.onMove(data.question.id, -1)}>
          <ArrowUp size={14} />
          Выше
        </button>
        <button type="button" onClick={() => data.onMove(data.question.id, 1)}>
          <ArrowDown size={14} />
          Ниже
        </button>
        <button type="button" className="survey-flow-node__danger" onClick={() => data.onRemove(data.question.id)}>
          <Trash2 size={14} />
          Удалить
        </button>
      </div>
    </div>
  );
}

export default function SurveyFlowBuilder({
  surveyId,
  questions,
  onRefresh,
  onRemoveQuestion,
  onSuccess,
  onError,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const reactFlowRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const orderedQuestions = useMemo(() => (Array.isArray(questions) ? questions : []), [questions]);
  const canvasHeight = useMemo(() => {
    const rows = Math.max(1, Math.ceil(orderedQuestions.length / 3));
    return Math.max(760, rows * 300);
  }, [orderedQuestions.length]);
  const fitCanvas = useCallback(() => {
    if (!reactFlowRef.current || !orderedQuestions.length || !isCanvasReady) {
      return;
    }

    window.requestAnimationFrame(() => {
      reactFlowRef.current.fitView(FIT_VIEW_OPTIONS);
    });
  }, [isCanvasReady, orderedQuestions.length]);

  useEffect(() => {
    const container = canvasContainerRef.current;

    if (!container) {
      setIsCanvasReady(false);
      return undefined;
    }

    const updateCanvasState = () => {
      setIsCanvasReady(container.clientWidth > 0 && container.clientHeight > 0);
    };

    updateCanvasState();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateCanvasState();
      });

      observer.observe(container);

      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateCanvasState);
    return () => window.removeEventListener('resize', updateCanvasState);
  }, [canvasHeight, surveyId]);

  const moveQuestion = useCallback(async (questionId, direction) => {
    const currentIndex = orderedQuestions.findIndex((item) => item.id === questionId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedQuestions.length) {
      return;
    }

    const nextIds = orderedQuestions.map((item) => item.id);
    const [movedId] = nextIds.splice(currentIndex, 1);
    nextIds.splice(nextIndex, 0, movedId);

    try {
      await questionsAPI.reorder(surveyId, nextIds);
      onSuccess('Основной маршрут обновлён.');
      await onRefresh();
    } catch (moveError) {
      onError(moveError.message || 'Не удалось изменить основной порядок вопросов.');
    }
  }, [onError, onRefresh, onSuccess, orderedQuestions, surveyId]);



  useEffect(() => {
    const storedLayout = readStoredLayout(surveyId);

    setNodes((currentNodes) =>
      orderedQuestions.map((question, index) => {
        const currentNode = currentNodes.find((node) => node.id === String(question.id));
        const selectedRule = Array.isArray(question.branch_rules)
          ? question.branch_rules.find((rule) => getEdgeId(question.id, rule.condition_value) === selectedBranchId)
          : null;

        return {
          id: String(question.id),
          type: 'surveyQuestion',
          position: currentNode?.position || storedLayout[String(question.id)] || getFallbackPosition(index),
          draggable: true,
          data: {
            index,
            question,
            typeLabel: getQuestionTypeLabel(question.type),
            branchOptions: getBranchValueOptions(question),
            activeBranchValues: Array.isArray(question.branch_rules)
              ? question.branch_rules.map((rule) => String(rule.condition_value))
              : [],
            selectedBranchValue:
              selectedRule?.condition_value === undefined || selectedRule?.condition_value === null
                ? ''
                : String(selectedRule.condition_value),
            defaultTargetLabel: getDefaultNextQuestion(question.id, orderedQuestions)?.text || '',
            onMove: moveQuestion,
            onRemove: onRemoveQuestion,
          },
        };
      }),
    );
  }, [moveQuestion, onRemoveQuestion, orderedQuestions, selectedBranchId, setNodes, surveyId]);

  function buildEdges() {
    const items = [];

    orderedQuestions.forEach((question) => {
      const nextQuestion = getDefaultNextQuestion(question.id, orderedQuestions);

      if (nextQuestion) {
        items.push({
          id: `default-${question.id}-${nextQuestion.id}`,
          source: String(question.id),
          sourceHandle: 'default',
          target: String(nextQuestion.id),
          type: 'smoothstep',
          selectable: false,
          animated: false,
          style: {
            stroke: '#cbd5e1',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#cbd5e1',
          },
        });
      }

      if (!Array.isArray(question.branch_rules)) {
        return;
      }

      question.branch_rules.forEach((rule) => {
        if (!rule?.target_question_id) {
          return;
        }

        const color = getActionColor(rule.action);
        const edgeId = getEdgeId(question.id, rule.condition_value);

        items.push({
          id: edgeId,
          source: String(question.id),
          sourceHandle: `branch::${encodeBranchValue(rule.condition_value)}`,
          target: String(rule.target_question_id),
          type: 'smoothstep',
          animated: true,
          label: `${rule.condition_value} -> ${getActionLabel(rule.action)}`,
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 999,
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 0.92,
            stroke: color,
            strokeWidth: 1,
          },
          style: {
            stroke: color,
            strokeWidth: selectedBranchId === edgeId ? 3 : 2.4,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
          },
          data: {
            kind: 'branch',
            questionId: question.id,
            conditionValue: String(rule.condition_value),
          },
        });
      });
    });

    return items;
  }

  function persistLayout(nextNodes) {
    writeStoredLayout(surveyId, nextNodes);
  }

  function handleNodeDragStop(_, node) {
    const nextNodes = nodes.map((item) =>
      item.id === node.id ? { ...item, position: node.position } : item,
    );
    persistLayout(nextNodes);
  }

  async function updateBranchRule(questionId, conditionValue, patch) {
    const sourceQuestion = orderedQuestions.find((item) => item.id === questionId);

    if (!sourceQuestion) {
      return;
    }

    const branchRules = Array.isArray(sourceQuestion.branch_rules) ? [...sourceQuestion.branch_rules] : [];
    const ruleIndex = branchRules.findIndex(
      (rule) => String(rule.condition_value) === String(conditionValue),
    );

    if (ruleIndex < 0) {
      return;
    }

    const nextRule = {
      condition_question_id: questionId,
      ...branchRules[ruleIndex],
      ...patch,
    };

    if (nextRule.target_question_id) {
      nextRule.target_question_id = Number(nextRule.target_question_id);
    }

    branchRules[ruleIndex] = nextRule;

    try {
      await questionsAPI.update(surveyId, questionId, { branch_rules: branchRules });
      await onRefresh();
      onSuccess('Стрелка перехода обновлена.');
    } catch (updateError) {
      onError(updateError.message || 'Не удалось обновить правило перехода.');
    }
  }

  async function handleConnect(connection) {
    const sourceQuestionId = Number(connection.source);
    const targetQuestionId = Number(connection.target);
    const conditionValue = decodeBranchHandle(connection.sourceHandle);

    if (!sourceQuestionId || !targetQuestionId || !conditionValue) {
      return;
    }

    const sourceQuestion = orderedQuestions.find((item) => item.id === sourceQuestionId);

    if (!sourceQuestion) {
      return;
    }

    const branchRules = Array.isArray(sourceQuestion.branch_rules) ? [...sourceQuestion.branch_rules] : [];
    const existingIndex = branchRules.findIndex(
      (rule) => String(rule.condition_value) === String(conditionValue),
    );

    const nextRule = {
      condition_question_id: sourceQuestionId,
      condition_value: conditionValue,
      action: existingIndex >= 0 ? branchRules[existingIndex].action || 'skip_to' : 'skip_to',
      target_question_id: targetQuestionId,
    };

    if (existingIndex >= 0) {
      branchRules[existingIndex] = { ...branchRules[existingIndex], ...nextRule };
    } else {
      branchRules.push(nextRule);
    }

    try {
      await questionsAPI.update(surveyId, sourceQuestionId, { branch_rules: branchRules });
      setSelectedBranchId(getEdgeId(sourceQuestionId, conditionValue));
      await onRefresh();
      onSuccess('Стрелка ветвления сохранена.');
    } catch (saveError) {
      onError(saveError.message || 'Не удалось сохранить стрелку ветвления.');
    }
  }

  async function removeBranchRule(questionId, conditionValue) {
    const sourceQuestion = orderedQuestions.find((item) => item.id === questionId);

    if (!sourceQuestion) {
      return;
    }

    const branchRules = Array.isArray(sourceQuestion.branch_rules)
      ? sourceQuestion.branch_rules.filter(
          (rule) => String(rule.condition_value) !== String(conditionValue),
        )
      : [];

    try {
      await questionsAPI.update(surveyId, questionId, { branch_rules: branchRules });
      setSelectedBranchId(null);
      await onRefresh();
      onSuccess('Стрелка удалена.');
    } catch (removeError) {
      onError(removeError.message || 'Не удалось удалить стрелку перехода.');
    }
  }

  function resetLayout() {
    const nextNodes = orderedQuestions.map((question, index) => ({
      id: String(question.id),
      type: 'surveyQuestion',
      position: getFallbackPosition(index),
      data: nodes.find((node) => node.id === String(question.id))?.data,
    }));

    setNodes((currentNodes) =>
      currentNodes.map((node, index) => ({
        ...node,
        position: getFallbackPosition(index),
      })),
    );
    persistLayout(nextNodes);
    fitCanvas();
  }

  useEffect(() => {
    if (!nodes.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      fitCanvas();
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [fitCanvas, nodes, surveyId]);

  const selectedEdge = buildEdges().find((edge) => edge.id === selectedBranchId);
  const selectedQuestion = selectedEdge?.data?.questionId
    ? orderedQuestions.find((item) => item.id === selectedEdge.data.questionId)
    : null;
  const selectedRule = selectedQuestion
    ? (selectedQuestion.branch_rules || []).find(
        (rule) => String(rule.condition_value) === String(selectedEdge?.data?.conditionValue),
      )
    : null;

  return (
    <div className="survey-flow-builder">
      <div className="survey-flow-builder__sidebar">
        <div className="survey-flow-panel">
          <div className="survey-flow-panel__header">
            <Route size={16} />
            <strong>Основной маршрут</strong>
          </div>
          <p>
            Серые стрелки идут по порядку вопросов. Меняйте его кнопками «Выше / Ниже» прямо на
            карточках.
          </p>
          <div className="survey-flow-route">
            {orderedQuestions.map((question, index) => (
              <div key={question.id} className="survey-flow-route__item">
                <span>{index + 1}</span>
                <div>
                  <strong>{question.text}</strong>
                  <small>{getQuestionTypeLabel(question.type)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="survey-flow-panel">
          <div className="survey-flow-panel__header">
            <GitBranchPlus size={16} />
            <strong>Как настраивать ветвление</strong>
          </div>
          <p>
            Потяните красную точку у нужного ответа на карточке и соедините её с целевым вопросом.
          </p>
          <p>
            После клика по красной стрелке справа можно сменить действие: `GoTo`, `Показать` или
            `Скрыть`.
          </p>
          <Button size="sm" variant="secondary" icon={WandSparkles} onClick={resetLayout}>
            Автораскладка карточек
          </Button>
        </div>
      </div>

      <div
        ref={canvasContainerRef}
        className="survey-flow-builder__canvas"
        style={{ height: `${canvasHeight}px` }}
      >
        {isCanvasReady ? (
          <ReactFlow
            key={`${surveyId}-${orderedQuestions.length}`}
            style={{ width: '100%', height: '100%' }}
            onInit={(instance) => {
              reactFlowRef.current = instance;
              fitCanvas();
            }}
            nodes={nodes}
            edges={buildEdges()}
            nodeTypes={FLOW_NODE_TYPES}
            onNodesChange={onNodesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onEdgeClick={(_, edge) =>
              setSelectedBranchId(edge.data?.kind === 'branch' ? edge.id : null)
            }
            onPaneClick={() => setSelectedBranchId(null)}
            fitView
            minZoom={0.45}
            maxZoom={1.5}
            defaultEdgeOptions={{
              type: 'smoothstep',
            }}
            connectionLineStyle={{
              stroke: '#e91428',
              strokeWidth: 2,
            }}
            className="survey-flow-canvas"
          >
            <MiniMap pannable zoomable className="survey-flow-canvas__minimap" />
            <Controls className="survey-flow-canvas__controls" showInteractive={false} />
            <Background gap={20} size={1} color="rgba(148, 163, 184, 0.22)" />
          </ReactFlow>
        ) : (
          <div className="survey-flow-canvas__fallback">
            <strong>Подготавливаем холст редактора</strong>
            <p>Контейнер получает размеры, после этого визуальный редактор появится автоматически.</p>
          </div>
        )}
      </div>

      <div className="survey-flow-builder__inspector">
        <div className="survey-flow-panel">
          <div className="survey-flow-panel__header">
            <GitBranchPlus size={16} />
            <strong>Настройка стрелки</strong>
          </div>

          {selectedQuestion && selectedRule ? (
            <div className="survey-flow-inspector">
              <div className="survey-flow-inspector__summary">
                <span>От вопроса</span>
                <strong>{selectedQuestion.text}</strong>
              </div>
              <div className="survey-flow-inspector__summary">
                <span>Если ответ</span>
                <strong>{selectedRule.condition_value}</strong>
              </div>

              <label className="field">
                <span>Действие</span>
                <select
                  value={selectedRule.action || 'skip_to'}
                  onChange={(event) =>
                    updateBranchRule(selectedQuestion.id, selectedRule.condition_value, {
                      action: event.target.value,
                    })
                  }
                >
                  <option value="skip_to">GoTo вопрос</option>
                  <option value="show">Показать вопрос</option>
                  <option value="hide">Скрыть вопрос</option>
                </select>
              </label>

              <label className="field">
                <span>Целевой вопрос</span>
                <select
                  value={selectedRule.target_question_id || ''}
                  onChange={(event) =>
                    updateBranchRule(selectedQuestion.id, selectedRule.condition_value, {
                      target_question_id: event.target.value,
                    })
                  }
                >
                  <option value="">Выберите вопрос</option>
                  {orderedQuestions
                    .filter((item) => item.id !== selectedQuestion.id)
                    .map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {index + 1}. {item.text}
                      </option>
                    ))}
                </select>
              </label>

              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={() => removeBranchRule(selectedQuestion.id, selectedRule.condition_value)}
              >
                Удалить стрелку
              </Button>
            </div>
          ) : (
            <div className="survey-flow-empty">
              <strong>Выберите стрелку на холсте</strong>
              <p>
                Здесь можно поменять тип действия или снять переход, если ветка больше не нужна.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
