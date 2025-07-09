import * as Y from 'yjs';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';
import { DocumentOperation } from './operation-tracker';

export class YjsProvider {
  private ydoc: Y.Doc;
  private ytext: Y.Text;
  private documentId: string;
  private onOperationCallback?: (operations: Partial<DocumentOperation>[]) => void;

  constructor(documentId: string) {
    this.documentId = documentId;
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText('content');
    
    // Listen to Y.js updates and convert to operations
    this.ydoc.on('update', (update: Uint8Array) => {
      this.handleYjsUpdate(update);
    });
  }

  private handleYjsUpdate(update: Uint8Array) {
    try {
      // Convert Y.js update to our operation format
      const operations = this.updateToOperations(update);
      
      if (operations.length > 0 && this.onOperationCallback) {
        this.onOperationCallback(operations);
      }
    } catch (error) {
      console.error('Error handling Y.js update:', error);
    }
  }

  private updateToOperations(update: Uint8Array): Partial<DocumentOperation>[] {
    const operations: Partial<DocumentOperation>[] = [];
    
    try {
      // Parse the Y.js update
      // This is a simplified implementation - in production you'd want more sophisticated parsing
      const decoder = new Y.decoding.Decoder(update);
      
      // For now, we'll create a generic operation to indicate a Y.js update occurred
      // In a full implementation, you'd parse the Y.js operations more precisely
      operations.push({
        type: 'insert', // or 'delete' or 'format' based on the actual update
        metadata: {
          yjsUpdate: true,
          updateSize: update.length,
          timestamp: Date.now()
        }
      });
      
    } catch (error) {
      console.error('Error parsing Y.js update:', error);
    }
    
    return operations;
  }

  setOperationCallback(callback: (operations: Partial<DocumentOperation>[]) => void) {
    this.onOperationCallback = callback;
  }

  getYjsExtensions() {
    return [
      ySyncPlugin(this.ytext),
      yCursorPlugin(this.ydoc.getMap('cursors')),
      yUndoPlugin(),
    ];
  }

  getYDoc() {
    return this.ydoc;
  }

  getYText() {
    return this.ytext;
  }

  // Apply text content to Y.js document
  setContent(content: string) {
    this.ytext.delete(0, this.ytext.length);
    this.ytext.insert(0, content);
  }

  // Get text content from Y.js document
  getContent(): string {
    return this.ytext.toString();
  }

  // Clean up
  destroy() {
    this.ydoc.destroy();
  }
}