import { createServer, type IncomingMessage } from 'http'
import express from 'express'
import { WebSocketServer } from 'ws'
// @ts-ignore
import { setupWSConnection } from 'y-websocket/bin/utils'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

wss.on('connection', (conn: WebSocket, req: IncomingMessage) => {
	return setupWSConnection(conn, req, { gc: true })
})

server.listen(3001, () => {
	// eslint-disable-next-line no-console
	console.log('Web socket server running on http://localhost:3001')
})
