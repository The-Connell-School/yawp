import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Badge } from '~/components/ui/badge';
import { Clock, Users, Edit, Trash2, Type, Undo2, Redo2, Eye, RotateCcw, Play, Pause, History } from 'lucide-react';
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
}

interface DocumentSnapshot {
  id: string;
  html: string;
  text: string;
  timestamp: string;
  operationId: string;
}

interface Props {
  documentId: string;
  editor?: Editor;
  historyManager?: HistoryManager;
}

export function DocumentHistoryViewer({ documentId, editor, historyManager }: Props) {
  const [operations, setOperations] = useState<DocumentOperation[]>([]);
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'operations' | 'snapshots'>('operations');
  const [previewMode, setPreviewMode] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms between operations

  const loadOperations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/document/${documentId}/operations`);
      if (response.ok) {
        const data = await response.json();
        setOperations(data.operations || []);
      }
    } catch (error) {
      console.error('Failed to load operations:', error);
    }
    setLoading(false);
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
      loadOperations();
    } else {
      loadSnapshots();
    }
  }, [view, documentId]);

  // Time-travel functions
  const handlePreviewOperation = async (position: number) => {
    if (!historyManager) return;
    
    try {
      const preview = await historyManager.previewAtPosition(position);
      setPreviewContent(preview.content);
      setPreviewPosition(position);
      setPreviewSnapshot(null);
      setPreviewMode(true);
    } catch (error) {
      console.error('Failed to preview operation:', error);
    }
  };

  const handlePreviewSnapshot = async (snapshot: DocumentSnapshot) => {
    if (!historyManager) return;
    
    try {
      const content = await historyManager.reconstructDocumentAtSnapshot(snapshot.id);
      setPreviewContent(content);
      setPreviewPosition(null);
      setPreviewSnapshot(snapshot.id);
      setPreviewMode(true);
    } catch (error) {
      console.error('Failed to preview snapshot:', error);
    }
  };

  const handleResetToOperation = async (position: number) => {
    if (!historyManager || !editor) return;
    
    try {
      await historyManager.resetToPosition(position, editor);
      setPreviewMode(false);
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
      setPreviewMode(false);
      // Reload operations to show the new state
      loadOperations();
    } catch (error) {
      console.error('Failed to reset to snapshot:', error);
    }
  };

  const handleClosePreview = () => {
    setPreviewMode(false);
    setPreviewContent('');
    setPreviewPosition(null);
    setPreviewSnapshot(null);
  };

  const handlePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    
    if (operations.length === 0) return;
    
    setIsPlaying(true);
    let currentIndex = 0;
    
    const playNext = () => {
      if (currentIndex >= operations.length || !isPlaying) {
        setIsPlaying(false);
        return;
      }
      
      const operation = operations[currentIndex];
      handlePreviewOperation(operation.position);
      currentIndex++;
      
      setTimeout(playNext, playbackSpeed);
    };
    
    playNext();
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm">
          <Clock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Document History - Time Travel</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-full">
          {/* Main History Panel */}
          <div className="flex-1 flex flex-col">
            <div className="flex gap-2 mb-4">
              <Button
                variant={view === 'operations' ? 'default' : 'outline'}
                onClick={() => setView('operations')}
                size="sm"
              >
                Operations ({operations.length})
              </Button>
              <Button
                variant={view === 'snapshots' ? 'default' : 'outline'}
                onClick={() => setView('snapshots')}
                size="sm"
              >
                Snapshots ({snapshots.length})
              </Button>
              
              {/* Playback Controls */}
              {view === 'operations' && operations.length > 0 && (
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePlayback}
                    disabled={!historyManager}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    <option value={500}>2x</option>
                    <option value={1000}>1x</option>
                    <option value={2000}>0.5x</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
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
                        className={`border rounded-lg p-3 space-y-2 ${
                          previewPosition === operation.position ? 'bg-blue-50 border-blue-300' : ''
                        }`}
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

                        {/* Time Travel Actions */}
                        {historyManager && editor && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreviewOperation(operation.position)}
                              disabled={isPlaying}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResetToOperation(operation.position)}
                              disabled={isPlaying}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset Here
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}

                  {view === 'snapshots' &&
                    snapshots.map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className={`border rounded-lg p-3 space-y-2 ${
                          previewSnapshot === snapshot.id ? 'bg-blue-50 border-blue-300' : ''
                        }`}
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

                        {/* Time Travel Actions */}
                        {historyManager && editor && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreviewSnapshot(snapshot)}
                              disabled={isPlaying}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResetToSnapshot(snapshot.id)}
                              disabled={isPlaying}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset Here
                            </Button>
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
                </div>
              )}
            </div>
          </div>

          {/* Preview Panel */}
          {previewMode && (
            <div className="w-96 border-l pl-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Preview
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClosePreview}
                >
                  ×
                </Button>
              </div>
              
              <div className="text-sm text-gray-600 mb-2">
                {previewPosition !== null && `Position ${previewPosition}`}
                {previewSnapshot && `Snapshot preview`}
              </div>
              
              <div className="flex-1 border rounded-lg p-3 bg-gray-50 overflow-y-auto">
                <div className="text-sm whitespace-pre-wrap">
                  {previewContent || 'No content to preview'}
                </div>
              </div>
              
              <div className="mt-3 text-xs text-gray-500">
                {previewContent.length} characters
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
