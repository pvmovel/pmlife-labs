<?php
/**
 * Modelo das chaves do gateway de IA (valores FICTÍCIOS). Vão no MESMO arquivo de ambiente fora do webroot
 * que as demos do labs já usam (labs.<env>.env.php, permissão 600). Chaves só de free tier, sem billing.
 */
return [
    // Ordem de tentativa: o segundo só é chamado se o primeiro falhar (cota, rede, chave...).
    'AI_PROVIDERS' => 'gemini,groq',
    'GEMINI_API_KEY' => 'change-me',
    'GEMINI_MODEL' => 'gemini-3.5-flash-lite',   // conferir em ai.google.dev/gemini-api/docs/models
    'GROQ_API_KEY' => 'change-me',
    'GROQ_MODEL' => 'llama-3.1-8b-instant',      // conferir em console.groq.com/docs/models
    'AI_MAX_TOKENS' => 600,

    // Proteção de cota: por IP e um teto global diário.
    'AI_LIMIT_PER_MINUTE' => 5,
    'AI_LIMIT_PER_DAY' => 30,
    'AI_LIMIT_GLOBAL_PER_DAY' => 200,
    'AI_RATE_LIMIT_SALT' => 'troque-por-um-texto-aleatorio',
    // Arquivo dos contadores, FORA do webroot (a pasta é criada com permissão 700 se não existir).
    'AI_RATE_LIMIT_FILE' => '/home<N>/<conta>/labs-ai/rate-limit.json',
];
