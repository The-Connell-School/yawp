import { useCallback, useEffect, useState } from 'react';
import { useFetcher } from 'react-router';

export interface DocumentOperation {
  id: string;
  createdAt: string;
  documentId: string;
  userId: string;
  operationType: string;
  position: number;
  content?: string;
  metadata?: string;
  stackPosition: number;
}

interface CreateOperationData {
  documentId: string;
  operationType: string;
  position: number;
  content?: string;
  metadata?: string;
  stackPosition: number;
}

export function useDocumentOperations(documentId: string) {
  const [operations, setOperations] = useState<DocumentOperation[]>([]);
  const [currentStackPosition, setCurrentStackPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const fetcher = useFetcher();
  const createFetcher = useFetcher();

  // Load existing operations
  const loadOperations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/model/document-operation?documentId=${documentId}`);
      if (response.ok) {
        const data = await response.json();
        setOperations(data);
        // Set current stack position to the latest operation
        if (data.length > 0) {
          setCurrentStackPosition(Math.max(...data.map((op: DocumentOperation) => op.stackPosition)));
        }
      }
    } catch (error) {
      console.error('Failed to load operations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  // Create a new operation
  const createOperation = useCallback(async (operationData: CreateOperationData) => {
    const nextStackPosition = currentStackPosition + 1;
    const formData = new FormData();
    formData.append('documentId', operationData.documentId);
    formData.append('operationType', operationData.operationType);
    formData.append('position', operationData.position.toString());
    formData.append('stackPosition', nextStackPosition.toString());
    
    if (operationData.content) {
      formData.append('content', operationData.content);
    }
    if (operationData.metadata) {
      formData.append('metadata', operationData.metadata);
    }

    createFetcher.submit(formData, {
      method: 'POST',
      action: '/api/model/document-operation',
    });

    setCurrentStackPosition(nextStackPosition);
  }, [currentStackPosition, createFetcher]);

  // Get operations for undo/redo
  const getOperationsForUndo = useCallback(() => {
    return operations
      .filter(op => op.stackPosition <= currentStackPosition)
      .sort((a, b) => b.stackPosition - a.stackPosition);
  }, [operations, currentStackPosition]);

  const getOperationsForRedo = useCallback(() => {
    return operations
      .filter(op => op.stackPosition > currentStackPosition)
      .sort((a, b) => a.stackPosition - b.stackPosition);
  }, [operations, currentStackPosition]);

  // Check if undo/redo is possible
  const canUndo = useCallback(() => {
    return getOperationsForUndo().length > 0;
  }, [getOperationsForUndo]);

  const canRedo = useCallback(() => {
    return getOperationsForRedo().length > 0;
  }, [getOperationsForRedo]);

  // Navigate to a specific stack position
  const navigateToStackPosition = useCallback((position: number) => {
    setCurrentStackPosition(position);
  }, []);

  // Load operations on mount
  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  // Update operations when create operation succeeds
  useEffect(() => {
    if (createFetcher.state === 'idle' && createFetcher.data) {
      setOperations(prev => [...prev, createFetcher.data]);
    }
  }, [createFetcher.state, createFetcher.data]);

  return {
    operations,
    currentStackPosition,
    isLoading,
    createOperation,
    canUndo,
    canRedo,
    navigateToStackPosition,
    getOperationsForUndo,
    getOperationsForRedo,
    reloadOperations: loadOperations,
  };
}