# Document Version History System

This directory contains the implementation of a keystroke-level document version history system that provides comprehensive tracking of all document changes.

## Features

### 1. Keystroke-Level Tracking
- Every insert, delete, format, undo, and redo operation is tracked
- Operations are converted from TipTap transactions to database records
- Batched processing for optimal performance

### 2. Append-Only Operations Stack
- Operations are never updated or deleted
- Undo and redo operations create new entries in the stack
- Complete audit trail maintained for document reconstruction

### 3. Automatic Snapshots
- Document snapshots are created every 200 operations
- Snapshots store the full HTML and text content at that point in time
- Enables fast recovery without replaying all operations

### 4. Custom Undo/Redo System
- Overrides default TipTap undo/redo with custom implementation
- Works with the operations stack for consistent history
- Visual feedback for disabled states

### 5. Document History Viewer
- Interactive UI to view operations and snapshots
- Shows operation details, timestamps, and user information
- Searchable and filterable history

## Architecture

### Database Schema

```prisma
model DocumentOperation {
  id          String   @id @default(cuid())
  documentId  String
  userId      String
  position    Int      // Sequential position in operation stack
  timestamp   DateTime @default(now())
  type        String   // 'insert', 'delete', 'format', 'undo', 'redo'
  content     String?  // Content for insert operations
  range       Json?    // { from: number, to: number }
  attributes  Json?    // Formatting attributes
  metadata    Json?    // Additional operation metadata
  
  // Relations and indexes...
}

model DocumentSnapshot {
  id          String   @id @default(cuid())
  documentId  String
  operationId String   // Reference to the operation when snapshot was taken
  html        String
  text        String
  timestamp   DateTime @default(now())
  
  // Relations and indexes...
}
```

### Key Components

1. **OperationTracker** (`operation-tracker.ts`)
   - Converts TipTap transactions to database operations
   - Handles batching and flushing of operations
   - Manages operation position tracking

2. **HistoryManager** (`history-manager.ts`)
   - Implements custom undo/redo functionality
   - Manages operations stack and position tracking
   - Handles operation inversion for undo

3. **API Routes**
   - `/api/document/{id}/operations` - CRUD operations
   - `/api/document/{id}/operations/latest` - Current position
   - `/api/document/{id}/snapshots` - Snapshot viewing

4. **DocumentHistoryViewer** (`document-history-viewer.tsx`)
   - Interactive UI for viewing document history
   - Shows operations and snapshots
   - Provides filtering and search capabilities

5. **YJS Provider** (`yjs-provider.ts`)
   - Basic YJS integration for future collaboration features
   - Converts YJS operations to database operations

## Usage

### For Developers

1. **Database Migration**:
   ```bash
   npx prisma migrate dev
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Integration**:
   The system is automatically integrated with the TipTap editor. No additional setup required for basic usage.

### For Users

1. **Normal Editing**: All keystrokes are automatically tracked
2. **Undo/Redo**: Use the toolbar buttons for custom undo/redo
3. **View History**: Click the "History" button in the toolbar to view document history
4. **Browse Operations**: Switch between operations and snapshots in the history viewer

## API Endpoints

### Operations

- `GET /api/document/{id}/operations` - Get all operations for a document
- `POST /api/document/{id}/operations` - Create new operations
- `GET /api/document/{id}/operations/latest` - Get current operation position

### Snapshots

- `GET /api/document/{id}/snapshots` - Get all snapshots for a document

## Performance Considerations

1. **Operation Batching**: Operations are batched and flushed every 100ms or when 5 operations are queued
2. **Automatic Snapshots**: Snapshots are created every 200 operations to enable fast recovery
3. **Efficient Queries**: Database indexes on `documentId`, `position`, and `timestamp`
4. **Dual-Path Saving**: Existing debounced saves (1 second) work alongside operation tracking

## Future Enhancements

1. **Real-Time Collaboration**: Full YJS integration for real-time editing
2. **Operation Compression**: Compress similar operations for storage efficiency
3. **Configurable Snapshot Frequency**: Make snapshot frequency configurable
4. **Advanced History Viewer**: Add more filtering and search capabilities
5. **Performance Monitoring**: Add metrics for operation processing performance

## Troubleshooting

1. **Operations Not Saving**: Check network requests to `/api/document/{id}/operations`
2. **Undo/Redo Not Working**: Verify HistoryManager initialization
3. **History Viewer Empty**: Check API endpoints for proper authentication
4. **Performance Issues**: Monitor operation queue size and flush frequency

## Data Loss Prevention

The system is designed to prevent data loss through:

1. **Append-Only Architecture**: Operations are never deleted
2. **Dual-Path Saving**: Both operations and debounced saves work together
3. **Automatic Snapshots**: Regular snapshots provide recovery points
4. **Complete Audit Trail**: Every change is tracked with timestamps and user info
5. **Point-in-Time Recovery**: Document state can be reconstructed from operations

This system provides comprehensive document version history while maintaining performance and preventing data loss.