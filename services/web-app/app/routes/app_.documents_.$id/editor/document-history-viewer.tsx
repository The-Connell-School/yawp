import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { Badge } from '~/components/ui/badge';
import { Clock, Users, Edit, Trash2, Type, Undo2, Redo2 } from 'lucide-react';

interface DocumentOperation {
  id: string;
  position: number;
  type: 'insert' | 'delete' | 'format' | 'undo' | 'redo';
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
}

export function DocumentHistoryViewer({ documentId }: Props) {
  const [operations, setOperations] = useState<DocumentOperation[]>([]);
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'operations' | 'snapshots'>('operations');

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
        <Button variant="outline" size="sm">
          <Clock className="h-4 w-4 mr-2" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Document History</DialogTitle>
        </DialogHeader>
        
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
        </div>

        <div className="h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="space-y-2">
              {view === 'operations' && operations.map((operation) => (
                <div key={operation.id} className="border rounded-lg p-3 space-y-2">
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
                </div>
              ))}
              
              {view === 'snapshots' && snapshots.map((snapshot) => (
                <div key={snapshot.id} className="border rounded-lg p-3 space-y-2">
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
      </DialogContent>
    </Dialog>
  );
}