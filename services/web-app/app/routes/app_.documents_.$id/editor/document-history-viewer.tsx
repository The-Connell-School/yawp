import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Badge } from '~/components/ui/badge';
import {
  Clock,
  Users,
  Edit,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Eye,
  RotateCcw,
  History,
} from 'lucide-react';
import { type Editor } from '@tiptap/react';
import { HistoryManager } from './history-manager';

interface DocumentOperation {
  id: string;
  position: number;
  type: 'insert' | 'delete' | 'format' | 'undo' | 'redo' | 'reset';
  content?: string;
  range?: { from: number; to: number };
  attributes?: any;
  metadata?: any;
  timestamp: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  previewContent?: string;
}

interface DocumentSnapshot {
  id: string;
  html: string;
  text: string;
  timestamp: string;
  operationId: string;
  previewContent?: string;
}

interface Props {
  documentId: string;
  editor?: Editor;
  historyManager?: HistoryManager;
}

export function DocumentHistoryViewer({
  documentId,
  editor,
  historyManager,
}: Props) {
  const [operations, setOperations] = useState<DocumentOperation[]>([]);
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<'operations' | 'snapshots'>('operations');
  const [selectedOperation, setSelectedOperation] =
    useState<DocumentOperation | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<DocumentSnapshot | null>(null);
  const [hasMoreOperations, setHasMoreOperations] = useState(true);
  const [operationsPage, setOperationsPage] = useState(0);

  const loadOperations = async (page = 0, append = false) => {
    if (page === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const limit = 50;
      const offset = page * limit;
      const response = await fetch(
        `/api/document/${documentId}/operations?limit=${limit}&offset=${offset}`
      );
      if (response.ok) {
        const data = await response.json();
        const newOperations = data.operations || [];

        if (append) {
          setOperations((prev) => [...prev, ...newOperations]);
        } else {
          setOperations(newOperations);
        }

        setHasMoreOperations(newOperations.length === limit);
        setOperationsPage(page);
      }
    } catch (error) {
      console.error('Failed to load operations:', error);
    }

    setLoading(false);
    setLoadingMore(false);
  };

  const loadMoreOperations = async () => {
    if (!loadingMore && hasMoreOperations) {
      await loadOperations(operationsPage + 1, true);
    }
  };

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/document/${documentId}/snapshots`);
      if (response.ok) {
        const data = await response.json();
        setSnapshots(data.snapshots || []);
      }
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (view === 'operations') {
      setOperationsPage(0);
      setHasMoreOperations(true);
      loadOperations();
    } else {
      loadSnapshots();
    }
  }, [view, documentId]);

  // Refresh operations when history manager is updated
  useEffect(() => {
    if (historyManager && view === 'operations') {
      loadOperations();
    }
  }, [historyManager, view]);

  // Time-travel functions
  const handlePreviewOperation = async (operation: DocumentOperation) => {
    if (!historyManager) return;

    try {
      const preview = await historyManager.previewAtPosition(
        operation.position
      );
      setSelectedOperation({ ...operation, previewContent: preview.content });
      setSelectedSnapshot(null);
    } catch (error) {
      console.error('Failed to preview operation:', error);
    }
  };

  const handlePreviewSnapshot = async (snapshot: DocumentSnapshot) => {
    if (!historyManager) return;

    try {
      const content = await historyManager.reconstructDocumentAtSnapshot(
        snapshot.id
      );
      setSelectedSnapshot({ ...snapshot, previewContent: content });
      setSelectedOperation(null);
    } catch (error) {
      console.error('Failed to preview snapshot:', error);
    }
  };

  const handleResetToOperation = async (position: number) => {
    if (!historyManager || !editor) return;

    try {
      await historyManager.resetToPosition(position, editor);
      setSelectedOperation(null);
      setSelectedSnapshot(null);
      // Reload operations to show the new state
      loadOperations();
    } catch (error) {
      console.error('Failed to reset to operation:', error);
    }
  };

  const handleResetToSnapshot = async (snapshotId: string) => {
    if (!historyManager || !editor) return;

    try {
      await historyManager.resetToSnapshot(snapshotId, editor);
      setSelectedOperation(null);
      setSelectedSnapshot(null);
      // Reload operations to show the new state
      loadOperations();
    } catch (error) {
      console.error('Failed to reset to snapshot:', error);
    }
  };

  const handleClosePreview = () => {
    setSelectedOperation(null);
    setSelectedSnapshot(null);
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'insert':
        return <Edit className="h-4 w-4 text-green-500" />;
      case 'delete':
        return <Trash2 className="h-4 w-4 text-red-500" />;
      case 'format':
        return <Type className="h-4 w-4 text-blue-500" />;
      case 'undo':
        return <Undo2 className="h-4 w-4 text-orange-500" />;
      case 'redo':
        return <Redo2 className="h-4 w-4 text-purple-500" />;
      case 'reset':
        return <RotateCcw className="h-4 w-4 text-cyan-500" />;
      default:
        return <Edit className="h-4 w-4 text-gray-500" />;
    }
  };

  const getOperationDescription = (operation: DocumentOperation) => {
    switch (operation.type) {
      case 'insert':
        return `Inserted "${operation.content?.substring(0, 50)}${operation.content && operation.content.length > 50 ? '...' : ''}"`;
      case 'delete':
        return `Deleted ${operation.metadata?.deletedLength || 0} characters`;
      case 'format':
        return `Applied ${operation.attributes?.mark || 'formatting'}`;
      case 'undo':
        return `Undid ${operation.metadata?.originalType || 'operation'}`;
      case 'redo':
        return `Redid ${operation.metadata?.originalType || 'operation'}`;
      case 'reset':
        if (operation.metadata?.resetToPosition) {
          return `Reset to position ${operation.metadata.resetToPosition}`;
        } else if (operation.metadata?.resetToSnapshot) {
          return `Reset to snapshot`;
        }
        return 'Document reset';
      default:
        return 'Unknown operation';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Clock className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[800px] sm:max-w-[800px]">
        <SheetHeader>
          <SheetTitle>Document History</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full mt-6">
          <div className="flex gap-2 mb-4">
            <Button
              variant={view === 'operations' ? 'default' : 'outline'}
              onClick={() => setView('operations')}
              size="sm"
            >
              Operations
            </Button>
            <Button
              variant={view === 'snapshots' ? 'default' : 'outline'}
              onClick={() => setView('snapshots')}
              size="sm"
            >
              Snapshots
            </Button>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              const target = e.target as HTMLDivElement;
              if (
                target.scrollHeight - target.scrollTop <=
                  target.clientHeight + 100 &&
                !loadingMore &&
                hasMoreOperations &&
                view === 'operations'
              ) {
                loadMoreOperations();
              }
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {view === 'operations' &&
                  operations.map((operation) => (
                    <div
                      key={operation.id}
                      className={`border rounded-lg p-3 space-y-2 cursor-pointer hover:bg-gray-50 ${
                        selectedOperation?.id === operation.id
                          ? 'bg-blue-50 border-blue-300'
                          : ''
                      }`}
                      onClick={() => handlePreviewOperation(operation)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getOperationIcon(operation.type)}
                          <Badge variant="outline">{operation.type}</Badge>
                          <span className="text-sm text-gray-600">
                            Position {operation.position}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Users className="h-3 w-3" />
                          {operation.user.name}
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(operation.timestamp)}
                        </div>
                      </div>

                      <div className="text-sm">
                        {getOperationDescription(operation)}
                      </div>

                      {operation.range && (
                        <div className="text-xs text-gray-500">
                          Range: {operation.range.from} - {operation.range.to}
                        </div>
                      )}

                      {/* Preview Content */}
                      {selectedOperation?.id === operation.id &&
                        selectedOperation.previewContent && (
                          <div className="mt-3 p-3 bg-gray-50 rounded border">
                            <div className="text-xs text-gray-500 mb-2">
                              Document at this point:
                            </div>
                            <div className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {selectedOperation.previewContent}
                            </div>
                            {historyManager && editor && (
                              <div className="flex gap-2 mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleResetToOperation(operation.position)
                                  }
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Reset Here
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  ))}

                {view === 'snapshots' &&
                  snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className={`border rounded-lg p-3 space-y-2 cursor-pointer hover:bg-gray-50 ${
                        selectedSnapshot?.id === snapshot.id
                          ? 'bg-blue-50 border-blue-300'
                          : ''
                      }`}
                      onClick={() => handlePreviewSnapshot(snapshot)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Snapshot</Badge>
                          <span className="text-sm text-gray-600">
                            {snapshot.text.length} characters
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(snapshot.timestamp)}
                        </div>
                      </div>

                      <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
                        {snapshot.text.substring(0, 200)}
                        {snapshot.text.length > 200 && '...'}
                      </div>

                      {/* Preview Content */}
                      {selectedSnapshot?.id === snapshot.id &&
                        selectedSnapshot.previewContent && (
                          <div className="mt-3 p-3 bg-gray-50 rounded border">
                            <div className="text-xs text-gray-500 mb-2">
                              Document at this point:
                            </div>
                            <div className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {selectedSnapshot.previewContent}
                            </div>
                            {historyManager && editor && (
                              <div className="flex gap-2 mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleResetToSnapshot(snapshot.id)
                                  }
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Reset Here
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  ))}

                {((view === 'operations' && operations.length === 0) ||
                  (view === 'snapshots' && snapshots.length === 0)) && (
                  <div className="text-center p-8 text-gray-500">
                    No {view} found for this document.
                  </div>
                )}

                {/* Loading more operations indicator */}
                {view === 'operations' && loadingMore && (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    <span className="ml-2 text-sm text-gray-500">
                      Loading more operations...
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
