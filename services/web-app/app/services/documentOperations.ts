import { type Editor } from '@tiptap/react';
import { type Transaction } from '@tiptap/pm/state';

export interface OperationMetadata {
  from: number;
  to: number;
  insertText?: string;
  deleteText?: string;
  mark?: string;
  node?: string;
  attributes?: Record<string, any>;
}

export interface ProcessedOperation {
  type: string;
  position: number;
  content?: string;
  metadata: OperationMetadata;
}

export class DocumentOperationService {
  private editor: Editor;
  private onOperation: (operation: ProcessedOperation) => void;

  constructor(editor: Editor, onOperation: (operation: ProcessedOperation) => void) {
    this.editor = editor;
    this.onOperation = onOperation;
  }

  // Process TipTap transaction to extract operation details
  processTransaction(transaction: Transaction): ProcessedOperation[] {
    const operations: ProcessedOperation[] = [];
    
    // Skip if transaction has no steps (no changes)
    if (!transaction.steps.length) {
      return operations;
    }

    transaction.steps.forEach((step, index) => {
      const stepData = step.toJSON();
      
      switch (stepData.stepType) {
        case 'replace':
          operations.push(this.processReplaceStep(stepData));
          break;
        case 'addMark':
          operations.push(this.processAddMarkStep(stepData));
          break;
        case 'removeMark':
          operations.push(this.processRemoveMarkStep(stepData));
          break;
        default:
          // Handle other step types as generic operations
          operations.push(this.processGenericStep(stepData));
      }
    });

    return operations;
  }

  private processReplaceStep(stepData: any): ProcessedOperation {
    const { from, to, slice } = stepData;
    const isInsertion = from === to;
    const isDeletion = slice.content.length === 0;
    
    let operationType = 'replace';
    let content = '';
    
    if (isInsertion && slice.content.length > 0) {
      operationType = 'insert';
      content = this.extractTextFromSlice(slice);
    } else if (isDeletion) {
      operationType = 'delete';
      content = this.getTextBetween(from, to);
    }

    return {
      type: operationType,
      position: from,
      content,
      metadata: {
        from,
        to,
        insertText: isInsertion ? content : undefined,
        deleteText: isDeletion ? content : undefined,
      },
    };
  }

  private processAddMarkStep(stepData: any): ProcessedOperation {
    const { from, to, mark } = stepData;
    
    return {
      type: 'addMark',
      position: from,
      content: this.getTextBetween(from, to),
      metadata: {
        from,
        to,
        mark: mark.type,
        attributes: mark.attrs,
      },
    };
  }

  private processRemoveMarkStep(stepData: any): ProcessedOperation {
    const { from, to, mark } = stepData;
    
    return {
      type: 'removeMark',
      position: from,
      content: this.getTextBetween(from, to),
      metadata: {
        from,
        to,
        mark: mark.type,
        attributes: mark.attrs,
      },
    };
  }

  private processGenericStep(stepData: any): ProcessedOperation {
    return {
      type: stepData.stepType || 'unknown',
      position: stepData.from || 0,
      content: '',
      metadata: stepData,
    };
  }

  private extractTextFromSlice(slice: any): string {
    // Extract text content from ProseMirror slice
    // This is a simplified implementation
    if (slice.content && slice.content.length > 0) {
      return slice.content.map((node: any) => node.text || '').join('');
    }
    return '';
  }

  private getTextBetween(from: number, to: number): string {
    return this.editor.state.doc.textBetween(from, to, ' ');
  }

  // Create inverse operation for undo functionality
  createInverseOperation(operation: ProcessedOperation): ProcessedOperation {
    const { type, position, content, metadata } = operation;
    
    switch (type) {
      case 'insert':
        return {
          type: 'delete',
          position,
          content,
          metadata: {
            ...metadata,
            from: position,
            to: position + (content?.length || 0),
          },
        };
      
      case 'delete':
        return {
          type: 'insert',
          position,
          content,
          metadata: {
            ...metadata,
            from: position,
            to: position,
          },
        };
      
      case 'addMark':
        return {
          type: 'removeMark',
          position,
          content,
          metadata,
        };
      
      case 'removeMark':
        return {
          type: 'addMark',
          position,
          content,
          metadata,
        };
      
      default:
        return operation;
    }
  }

  // Apply operation to editor
  applyOperation(operation: ProcessedOperation): void {
    const { type, position, content, metadata } = operation;
    
    switch (type) {
      case 'insert':
        if (content) {
          this.editor.commands.insertContentAt(position, content);
        }
        break;
      
      case 'delete':
        this.editor.commands.deleteRange({ from: position, to: position + (content?.length || 0) });
        break;
      
      case 'addMark':
        if (metadata.mark) {
          this.editor.commands.setTextSelection({ from: metadata.from, to: metadata.to });
          this.editor.commands.setMark(metadata.mark, metadata.attributes);
        }
        break;
      
      case 'removeMark':
        if (metadata.mark) {
          this.editor.commands.setTextSelection({ from: metadata.from, to: metadata.to });
          this.editor.commands.unsetMark(metadata.mark);
        }
        break;
    }
  }
}