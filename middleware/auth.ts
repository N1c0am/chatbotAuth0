import * as jose from 'jose';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? '';
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? '';
const ROLES_CLAIM = 'https://chatbot-api/roles';

const JWKS = jose.createRemoteJWKSet(
    new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
);

export interface TokenPayload {
    sub: string;
    [key: string]: any;
}

export async function verifyToken(req: Request): Promise<TokenPayload | null> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.replace('Bearer ', '');

    try {
        const { payload } = await jose.jwtVerify(token, JWKS, {
            issuer:   `https://${AUTH0_DOMAIN}/`,
            audience: AUTH0_AUDIENCE,
        });
        return payload as TokenPayload;
    } catch {
        return null;
    }
}

export function hasRole(payload: TokenPayload, role: string): boolean {
    const roles: string[] = payload[ROLES_CLAIM] ?? [];
    return roles.includes(role);
}

export function getUsername(payload: TokenPayload): string {
    return payload['email'] ?? payload['sub'] ?? 'unknown';
}