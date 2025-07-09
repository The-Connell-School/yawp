import { type Editor } from '@tiptap/react';
import { DocumentOperation } from './operation-tracker';

export class HistoryManager {
  private documentId: string;
  private operationStack: DocumentOperation[] = [];
  private currentPosition: number = 0;
  private isLoading = false;

  constructor(documentId: string) {
    this.documentId = documentId;
    this.loadOperations();
  }

  private async loadOperations() {
    this.isLoading = true;
    try {
      const response = await fetch(`/api/document/${this.documentId}/operations`);
      if (response.ok) {
        const data = await response.json();
        this.operationStack = data.operations.map((op: any) => ({
          ...op,
          range: op.range ? JSON.parse(op.range) : null,
          attributes: op.attributes ? JSON.parse(op.attributes) : null,
          metadata: op.metadata ? JSON.parse(op.metadata) : null,
        }));
        this.currentPosition = this.operationStack.length;
      }
    } catch (error) {
      console.error('Failed to load operations:', error);
    }
    this.isLoading = false;
  }

  async undo(editor: Editor) {
    if (this.isLoading || this.currentPosition <= 0) return;
    
    const operation = this.operationStack[this.currentPosition - 1];
    if (!operation) return;

    const undoOperation = this.createUndoOperation(operation);
    
    // Apply undo operation to editor
    this.applyOperationToEditor(editor, undoOperation);
    
    // Add undo operation to stack (append-only)
    await this.addOperationToStack(undoOperation);
    
    this.currentPosition--;
  }

  async redo(editor: Editor) {
    if (this.isLoading || this.currentPosition >= this.operationStack.length) return;
    
    const operation = this.operationStack[this.currentPosition];
    if (!operation) return;

    const redoOperation = this.createRedoOperation(operation);
    
    // Apply redo operation to editor
    this.applyOperationToEditor(editor, redoOperation);
    
    // Add redo operation to stack (append-only)
    await this.addOperationToStack(redoOperation);
    
    this.currentPosition++;
  }

  private createUndoOperation(operation: DocumentOperation): Partial<DocumentOperation> {
    switch (operation.type) {
      case 'insert':
        return {
          type: 'delete',
          range: operation.range,
          metadata: { 
            undoOf: operation.id,
            originalType: 'insert',
            originalContent: operation.content
          }
        };
      
      case 'delete':
        return {
          type: 'insert',
          range: operation.range,
          content: operation.metadata?.deletedContent || '',
          metadata: { 
            undoOf: operation.id,
            originalType: 'delete'
          }
        };
      
      case 'format':
        return {
          type: 'format',
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

  private applyOperationToEditor(editor: Editor, operation: Partial<DocumentOperation>) {
    const { tr } = editor.state;
    
    switch (operation.type) {
      case 'insert':
        if (operation.range && operation.content) {
          tr.insertText(operation.content, operation.range.from, operation.range.to);
        }
        break;
      
      case 'delete':
        if (operation.range) {
          tr.delete(operation.range.from, operation.range.to);
        }
        break;
      
      case 'format':
        if (operation.range && operation.attributes) {
          // Apply formatting changes
          const { from, to } = operation.range;
          const { mark, action, attrs } = operation.attributes;
          
          if (action === 'add') {
            const markType = editor.schema.marks[mark];
            if (markType) {
              tr.addMark(from, to, markType.create(attrs));
            }
          } else if (action === 'remove') {
            const markType = editor.schema.marks[mark];
            if (markType) {
              tr.removeMark(from, to, markType);
            }
          }
        }
        break;
      
      case 'undo':
      case 'redo':
        // These are handled by the specific undo/redo logic above
        break;
    }
    
    if (tr.docChanged) {
      editor.view.dispatch(tr);
    }
  }

  private async addOperationToStack(operation: Partial<DocumentOperation>) {
    try {
      const response = await fetch(`/api/document/${this.documentId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: [operation] })
      });

      if (response.ok) {
        const data = await response.json();
        // Add the operation to our local stack
        const newOperation = {
          ...operation,
          id: `temp-${Date.now()}`, // Temporary ID until we reload
          documentId: this.documentId,
          userId: '', // Will be set by server
          position: this.operationStack.length + 1,
          timestamp: new Date(),
        } as DocumentOperation;
        
        this.operationStack.push(newOperation);
      }
    } catch (error) {
      console.error('Failed to add operation to stack:', error);
    }
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

  // Check if undo is possible
  canUndo(): boolean {
    return !this.isLoading && this.currentPosition > 0;
  }

  // Check if redo is possible
  canRedo(): boolean {
    return !this.isLoading && this.currentPosition < this.operationStack.length;
  }

  // Get current operation count
  getOperationCount(): number {
    return this.operationStack.length;
  }

  // Time-travel functionality
  async reconstructDocumentAtPosition(targetPosition: number): Promise<string> {
    // Get operations up to the target position
    const relevantOperations = this.operationStack.filter(op => op.position <= targetPosition);
    
    // Sort by position to ensure correct order
    relevantOperations.sort((a, b) => a.position - b.position);
    
    // Start with empty document state
    let documentContent = '';
    
    // Apply operations in sequence
    for (const operation of relevantOperations) {
      documentContent = this.applyOperationToContent(documentContent, operation);
    }
    
    return documentContent;
  }

  async reconstructDocumentAtSnapshot(snapshotId: string): Promise<string> {
    try {
      const response = await fetch(`/api/document/${this.documentId}/snapshots/${snapshotId}`);
      if (response.ok) {
        const snapshot = await response.json();
        return snapshot.text || '';
      }
    } catch (error) {
      console.error('Failed to load snapshot:', error);
    }
    return '';
  }

  private applyOperationToContent(content: string, operation: DocumentOperation): string {
    switch (operation.type) {
      case 'insert':
        if (operation.range && operation.content) {
          const { from, to } = operation.range;
          return content.substring(0, from) + operation.content + content.substring(to);
        }
        break;
      
      case 'delete':
        if (operation.range) {
          const { from, to } = operation.range;
          return content.substring(0, from) + content.substring(to);
        }
        break;
      
      case 'undo':
        // For undo operations, we need to reverse the original operation
        if (operation.metadata?.originalType === 'insert') {
          // Undo insert = delete
          const { from, to } = operation.range || { from: 0, to: 0 };
          return content.substring(0, from) + content.substring(to);
        } else if (operation.metadata?.originalType === 'delete') {
          // Undo delete = insert
          const { from } = operation.range || { from: 0 };
          const deletedContent = operation.metadata?.originalContent || '';
          return content.substring(0, from) + deletedContent + content.substring(from);
        }
        break;
      
      case 'redo':
        // For redo operations, we apply the original operation
        if (operation.metadata?.originalOperation) {
          return this.applyOperationToContent(content, operation.metadata.originalOperation);
        }
        break;
    }
    
    return content;
  }

  async previewAtPosition(targetPosition: number): Promise<{
    content: string;
    position: number;
    timestamp: Date;
    operation?: DocumentOperation;
  }> {
    const content = await this.reconstructDocumentAtPosition(targetPosition);
    const operation = this.operationStack.find(op => op.position === targetPosition);
    
    return {
      content,
      position: targetPosition,
      timestamp: operation?.timestamp || new Date(),
      operation
    };
  }

  async resetToPosition(targetPosition: number, editor: Editor): Promise<void> {
    try {
      // Get the reconstructed content at the target position
      const targetContent = await this.reconstructDocumentAtPosition(targetPosition);
      
      // Clear the editor and set the new content
      const { tr } = editor.state;
      tr.replaceWith(0, editor.state.doc.content.size, editor.schema.text(targetContent));
      
      if (tr.docChanged) {
        editor.view.dispatch(tr);
      }
      
      // Update the current position
      this.currentPosition = targetPosition;
      
      // Record this reset as a new operation
      await this.addOperationToStack({
        type: 'reset',
        content: targetContent,
        metadata: { 
          resetToPosition: targetPosition,
          resetTimestamp: new Date()
        }
      });
      
      // Reload operations to get the latest state
      await this.loadOperations();
    } catch (error) {
      console.error('Failed to reset to position:', error);
      throw error;
    }
  }

  async resetToSnapshot(snapshotId: string, editor: Editor): Promise<void> {
    try {
      // Get the snapshot content
      const snapshotContent = await this.reconstructDocumentAtSnapshot(snapshotId);
      
      // Clear the editor and set the snapshot content
      const { tr } = editor.state;
      tr.replaceWith(0, editor.state.doc.content.size, editor.schema.text(snapshotContent));
      
      if (tr.docChanged) {
        editor.view.dispatch(tr);
      }
      
      // Record this reset as a new operation
      await this.addOperationToStack({
        type: 'reset',
        content: snapshotContent,
        metadata: { 
          resetToSnapshot: snapshotId,
          resetTimestamp: new Date()
        }
      });
      
      // Reload operations to get the latest state
      await this.loadOperations();
    } catch (error) {
      console.error('Failed to reset to snapshot:', error);
      throw error;
    }
  }

  // Get operations within a range
  getOperationsInRange(startPosition: number, endPosition: number): DocumentOperation[] {
    return this.operationStack.filter(op => 
      op.position >= startPosition && op.position <= endPosition
    ).sort((a, b) => a.position - b.position);
  }

  // Get all operations
  getAllOperations(): DocumentOperation[] {
    return [...this.operationStack].sort((a, b) => a.position - b.position);
  }

  // Cleanup
  destroy() {
    this.operationStack = [];
  }
}