import type { ChatMessage } from './types';
import * as readline from 'node:readline';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? '';
const CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET ?? '';
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? 'https://chatbot-api';

const TOKEN_URL = `https://${AUTH0_DOMAIN}/oauth/token`;

const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
};

interface Session {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    username: string;
}

let session: Session | null = null;

const conversationHistory: ChatMessage[] = [];

async function login(username: string, password: string): Promise<boolean> {
    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                username,
                password,
                grant_type: 'password',
                audience: AUTH0_AUDIENCE,
                scope: 'openid email'
            }),
        });

        if (!res.ok) {
            const err = await res.json() as { error_description?: string };
            console.error(`\n${c.red}  Login fallido: ${err.error_description ?? res.statusText}${c.reset}\n`);
            return false;
        }

        const data = await res.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };

        session = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in - 10) * 1000,
            username,
        };

        return true;
    } catch (err: any) {
        console.error(`\n${c.red}  Error conectando a Auth0: ${err.message}${c.reset}`);
        return false;
    }
}

async function refreshAccessToken(): Promise<boolean> {
    if (!session) return false;

    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: session.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!res.ok) return false;

        const data = await res.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };

        session.accessToken = data.access_token;
        session.refreshToken = data.refresh_token;
        session.expiresAt = Date.now() + (data.expires_in - 10) * 1000;

        return true;
    } catch {
        return false;
    }
}

async function getValidToken(): Promise<string | null> {
    if (!session) return null;

    if (Date.now() >= session.expiresAt) {
        process.stdout.write(`${c.gray}  🔄 Refrescando token...${c.reset}\r`);
        const ok = await refreshAccessToken();
        if (!ok) {
            console.error(`\n${c.red}  Sesión expirada. Por favor inicia sesión de nuevo.${c.reset}`);
            session = null;
            return null;
        }
    }

    return session.accessToken;
}

function printBanner(username?: string) {
    console.clear();
    console.log(`${c.blue}${c.bold}`);
    console.log(' ║***************BotTolomeo Chat Terminal***************║');
    console.log(`${c.reset}${c.gray} Conectado a: ${SERVER_URL}`);

    if (username) {
        console.log(` Bienvenido ${c.blue}${c.bold}${username}${c.reset}`);
    }
    console.log(`  ${c.green}${c.bold} Escribe "log out" para terminar la sesión`);
    console.log(`  ${c.green}${c.bold} Escribe "close" para salir de la aplicación`);
    console.log(`  ${c.green}${c.bold} Escribe "history" para ver la conversación.`);
    console.log(`  ${c.green}${c.bold} Escribe "clean" para borrar el historial\n${c.reset}`);
}

/*function printMessage(role: 'user' | 'assistant', content: string) {
    if (role === 'user') {
        console.log(`\n${c.green}${c.bold} Tú:${c.reset} ${content}`);
    } else {
        console.log(`\n${c.blue}${c.bold} BotTolomeo:${c.reset}`);
    }
}*/

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

async function loginFlow(rl: readline.Interface): Promise<void> {
    console.log(`\n${c.blue}${c.bold} 🔐 Inicio de sesión${c.reset}\n`);

    let attempts = 0;

    while (!session && attempts < 3) {
        const username = await askQuestion(rl, `${c.green} Usuario:    ${c.reset}`);
        const password = await askQuestion(rl, `${c.green} Contraseña: ${c.reset}`);

        process.stdout.write(`\n${c.gray}  Autenticando......${c.reset}`);
        const ok = await login(username.trim(), password.trim());

        if (ok) {
            process.stdout.write(`\r${c.blue} Bienvenido ${c.bold}${username.trim()}${c.reset}\n`);
            await new Promise(r => setTimeout(r, 700));
            printBanner(username.trim());
            return;
        }

        attempts++;
        if (attempts < 3) {
            console.log(`${c.yellow} Intento ${attempts}/3. Intenta de nuevo.${c.reset}\n`);
        }
    }

    console.error(`\n${c.red} Demasiados intentos fallidos. Saliendo.${c.reset}\n`);
    process.exit(1);
}


async function sendMessage(userInput: string): Promise<void> {
    const token = await getValidToken();
    if (!token) return;

    conversationHistory.push({ role: 'user', content: userInput });
    let fullResponse = '';

    try {
        const res = await fetch(`${SERVER_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ messages: conversationHistory }),
        });

        if (res.status === 401) {
            console.error(`\n${c.red} Token rechazado (401). Escribe "log out" para iniciar sesión de nuevo.${c.reset}\n`);
            conversationHistory.pop();
            return;
        }

        if (res.status === 403) {
            console.error(`\n${c.red} Acceso denegado (403). Tu usuario no tiene el rol necesario (user o admin).${c.reset}\n`);
            conversationHistory.pop();
            return;
        }

        if (!res.ok) {
            console.error(`\n${c.red} Error del servidor: ${res.status} ${res.statusText}${c.reset}\n`);
            conversationHistory.pop();
            return;
        }

        process.stdout.write(`\n${c.blue}${c.bold} BotTolomeo:${c.reset} `);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            process.stdout.write(chunk);
            fullResponse += chunk;
        }

        console.log('\n');

        if (fullResponse.trim()) {
            conversationHistory.push({ role: 'assistant', content: fullResponse });
        }

    } catch (err: any) {
        console.error(`\n${c.red} Error de conexión: ${err.message}${c.reset}\n`);
        conversationHistory.pop();
    }
}

function printHistory() {
    if (conversationHistory.length === 0) {
        console.log(`\n${c.gray} (Historial vacío)${c.reset}\n`);
        return;
    }
    console.log(`\n${c.yellow}${c.bold} ── Historial ──${c.reset}`);
    for (const msg of conversationHistory) {
        const label = msg.role === 'user' ? `${c.green}Tú${c.reset}` : `${c.blue} BotTolomeo${c.reset}`;
        const preview = msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content;
        console.log(`  ${c.gray}[${label}${c.gray}]${c.reset} ${preview}`);
    }
    console.log();
}



async function main() {
    printBanner();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    await loginFlow(rl);

    /*const prompt = () => {
        rl.question(`${c.green}${c.bold}  > ${c.reset}`, async (input) => {
            const trimmed = input.trim();

            if (!trimmed) {
                prompt();
                return;
            }

            // Comandos especiales
            if (trimmed.toLowerCase() === 'log out') {
                console.log(`\n${c.blue} Hasta luego humano! 👋${c.reset}\n`);
                rl.close();
                process.exit(0);
            }

            if (trimmed.toLowerCase() === 'clean') {
                conversationHistory.length = 0;
                printBanner();
                console.log(`${c.yellow}  Historial borrado.${c.reset}\n`);
                prompt();
                return;
            }

            if (trimmed.toLowerCase() === 'history') {
                printHistory();
                prompt();
                return;
            }

            // Enviar mensaje a la IA
            await sendMessage(trimmed);
            prompt();
        });
    };*/

    const prompt = () => {
        rl.question(`${c.green}${c.bold}  > ${c.reset}`, async (input) => {
            const trimmed = input.trim();
            if (!trimmed) { prompt(); return; }

            switch (trimmed.toLowerCase()) {
                case 'close':
                    console.log(`\n${c.blue} ¡Hasta luego ${session?.username} 👋${c.reset}\n`);
                    rl.close();
                    process.exit(0);

                case 'log out':
                    {
                        const username = session?.username;
                        session = null;
                        conversationHistory.length = 0;
                        printBanner();
                        console.log(`\n${c.blue} ¡Hasta luego ${username ?? 'usuario'} 👋${c.reset}`);
                        await loginFlow(rl);
                        break;
                    }

                case 'clean':
                    conversationHistory.length = 0;
                    printBanner(session?.username);
                    console.log(`${c.yellow}  Historial borrado.${c.reset}\n`);
                    break;

                case 'history':
                    printHistory();
                    break;

                default:
                    await sendMessage(trimmed);
            }

            prompt();
        });
    };

    prompt();
}

await main();