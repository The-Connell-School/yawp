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

  // Cleanup
  destroy() {
    this.operationStack = [];
  }
}