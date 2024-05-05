import { HttpResponse, http, type HttpHandler } from 'msw'

const { json } = HttpResponse

export const handlers: Array<HttpHandler> = [
	http.post(`https://o1.ingest.sentry.io/api/6690737/envelope/`, async () => {
		return json({})
	}),
]
