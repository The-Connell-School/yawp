import { Transaction } from '@tiptap/pm/state';

export interface DocumentOperation {
  id: string;
  documentId: string;
  userId: string;
  position: number;
  timestamp: Date;
  type: 'insert' | 'delete' | 'format' | 'undo' | 'redo' | 'reset';
  content?: string;
  range?: { from: number; to: number };
  attributes?: Record<string, any>;
  metadata?: Record<string, any>;
}

export class OperationTracker {
  private documentId: string;
  private position: number = 0;
  private operationQueue: Partial<DocumentOperation>[] = [];
  private queuedTransactions: Transaction[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private onOperationsFlushed?: () => void;

  constructor(documentId: string, onOperationsFlushed?: () => void) {
    this.documentId = documentId;
    this.onOperationsFlushed = onOperationsFlushed;
    this.initializePosition();
  }

  private async initializePosition() {
    try {
      // Get current position from latest operation
      const response = await fetch(`/api/document/${this.documentId}/operations/latest`);
      if (response.ok) {
        const data = await response.json();
        this.position = data.position || 0;
      }
    } catch (error) {
      console.error('Failed to initialize position:', error);
    }
    this.isInitialized = true;
    
    // Process any queued transactions
    this.queuedTransactions.forEach(transaction => {
      this.trackTransaction(transaction);
    });
    this.queuedTransactions = [];
  }

  trackTransaction(transaction: Transaction) {
    if (!transaction.docChanged) return;
    
    // Queue transactions if not yet initialized
    if (!this.isInitialized) {
      this.queuedTransactions.push(transaction);
      return;
    }

    transaction.steps.forEach((step) => {
      const operation = this.stepToOperation(step, transaction);
      if (operation) {
        this.addOperation(operation);
      }
    });
  }

  private stepToOperation(step: any, transaction: Transaction): Partial<DocumentOperation> | null {
    if (step.jsonID === 'replace') {
      const { from, to } = step;
      
      if (step.slice.content.size === 0) {
        // Delete operation - capture the deleted content from the original document
        const deletedContent = transaction.before.textBetween(from, to);
        
        return {
          type: 'delete',
          range: { from, to },
          metadata: { 
            deletedLength: to - from,
            deletedContent
          }
        };
      } else {
        // Insert operation
        const content = step.slice.content.textBetween(0, step.slice.content.size);
        return {
          type: 'insert',
          range: { from, to },
          content,
          metadata: { insertedLength: content.length }
        };
      }
    }
    
    // Handle formatting operations
    if (step.jsonID === 'addMark' || step.jsonID === 'removeMark') {
      return {
        type: 'format',
        range: { from: step.from, to: step.to },
        attributes: { 
          mark: step.mark.type.name,
          action: step.jsonID === 'addMark' ? 'add' : 'remove',
          attrs: step.mark.attrs
        }
      };
    }

    return null;
  }

  private addOperation(operation: Partial<DocumentOperation>) {
    this.position++;
    
    const fullOperation: Partial<DocumentOperation> = {
      documentId: this.documentId,
      position: this.position,
      timestamp: new Date(),
      ...operation
    };

    this.operationQueue.push(fullOperation);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    
    // Flush operations every 100ms or when queue reaches 5 operations
    this.flushTimeout = setTimeout(() => {
      this.flushOperations();
    }, this.operationQueue.length >= 5 ? 0 : 100);
  }

  private async flushOperations() {
    if (this.operationQueue.length === 0) return;

    const operations = [...this.operationQueue];
    this.operationQueue = [];

    try {
      const response = await fetch(`/api/document/${this.documentId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Notify that operations were successfully flushed
      if (this.onOperationsFlushed) {
        this.onOperationsFlushed();
      }
    } catch (error) {
      // Re-queue operations on failure
      this.operationQueue.unshift(...operations);
      console.error('Failed to save operations:', error);
    }
  }

  // Method to manually add undo/redo operations
  addUndoOperation(originalOperation: DocumentOperation) {
    const undoOperation = this.createUndoOperation(originalOperation);
    this.addOperation(undoOperation);
  }

  addRedoOperation(originalOperation: DocumentOperation) {
    const redoOperation = this.createRedoOperation(originalOperation);
    this.addOperation(redoOperation);
  }

  private createUndoOperation(operation: DocumentOperation): Partial<DocumentOperation> {
    switch (operation.type) {
      case 'insert':
        return {
          type: 'undo',
          range: operation.range,
          metadata: { 
            undoOf: operation.id,
            originalType: 'insert',
            originalContent: operation.content
          }
        };
      
      case 'delete':
        return {
          type: 'undo',
          range: operation.range,
          metadata: { 
            undoOf: operation.id,
            originalType: 'delete'
          }
        };
      
      case 'format':
        return {
          type: 'undo',
          range: operation.range,
          attributes: this.invertFormatAttributes(operation.attributes),
          metadata: { 
            undoOf: operation.id,
            originalType: 'format'
          }
        };
      
      default:
        return {
          type: 'undo',
          metadata: { 
            undoOf: operation.id,
            originalType: operation.type
          }
        };
    }
  }

  private createRedoOperation(operation: DocumentOperation): Partial<DocumentOperation> {
    return {
      type: 'redo',
      range: operation.range,
      content: operation.content,
      attributes: operation.attributes,
      metadata: { 
        redoOf: operation.id,
        originalOperation: operation
      }
    };
  }

  private invertFormatAttributes(attributes: any): any {
    if (!attributes) return attributes;
    
    // Invert formatting attributes for undo
    if (attributes.action === 'add') {
      return { ...attributes, action: 'remove' };
    } else if (attributes.action === 'remove') {
      return { ...attributes, action: 'add' };
    }
    
    return attributes;
  }

  // Cleanup method
  destroy() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    // Flush any remaining operations
    this.flushOperations();
  }
}