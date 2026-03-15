import { cerebrasService } from './services/cerebras';
import { groqService } from './services/groq';
import type { AIService, ChatMessage } from './types';
import { geminiService } from './services/gemini';
import { openRouterFreeService } from './services/openrouter_free';
import {openRouterArceService} from './services/openrouter_arce';
import { verifyToken, hasRole, getUsername } from './middleware/auth';

const services: AIService[] = [
    groqService,         // uno de los mejores servicios a utilizar con el modelo moonshotai/kimi-k2-instruct-0905
    //cerebrasService,   // Temporary reduction in GLM4.7 and GPT-OSS rate limits for free tier in place
    geminiService,       // uno de los mejores servicios a utilizar con el modelo gemini-2.5-flash
    openRouterArceService,
    openRouterFreeService,
    
]

let currentServiceIndex = 0;

function getNextService() {
    const service = services[currentServiceIndex];
    currentServiceIndex = (currentServiceIndex + 1) % services.length;
    return service;
}

const server = Bun.serve({
    port: process.env.PORT ?? 3000,
    async fetch(req) {
        const { pathname } = new URL(req.url);

        if (req.method === 'POST' && pathname === '/chat') {

            const payload = await verifyToken(req);
            if (!payload) {
                return new Response(JSON.stringify({ error: 'No autorizado' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (!hasRole(payload, 'user') && !hasRole(payload, 'admin')) {
                return new Response(JSON.stringify({ error: 'Acceso denegado' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            console.log(`User: ${getUsername(payload)}`);

            //procesar chat
            const { messages } = await req.json() as { messages: ChatMessage[] };
            const service = getNextService();

            console.log(`Using ${service?.name} service:`);
            const stream = await service?.chat(messages);

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        }

        return new Response("Not Found", { status: 404 });
    }
});

console.log(`Servidor corriendo en ${server.url}`);