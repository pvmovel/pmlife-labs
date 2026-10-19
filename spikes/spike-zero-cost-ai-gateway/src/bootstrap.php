<?php
declare(strict_types=1);

// Monta o gateway a partir do env (fora do webroot). Nenhuma chave, modelo ou limite fica no código.

spl_autoload_register(static function (string $class): void {
    if (strpos($class, 'Spike\\Ai\\') === 0) {
        require __DIR__ . '/Ai/' . substr($class, strlen('Spike\\Ai\\')) . '.php';
    }
});

use Spike\Ai\ChatGateway;
use Spike\Ai\CurlHttpClient;
use Spike\Ai\FailoverProvider;
use Spike\Ai\FileRateLimitStore;
use Spike\Ai\GeminiProvider;
use Spike\Ai\GroqProvider;
use Spike\Ai\HttpClient;
use Spike\Ai\RateLimiter;

/** @return array<string, string> nome da persona => system prompt (só no servidor) */
function personas(): array
{
    return ['tutor' => require __DIR__ . '/Ai/Personas/tutor.php'];
}

/**
 * Os provedores na ordem do failover. Cada um tem timeout de 12 s: os dois juntos cabem no max_execution_time
 * da hospedagem (~30 s). Com 20 s cada, um Gemini lento matava o PHP antes de a Groq responder.
 *
 * @param array<string, mixed> $env
 * @return list<Spike\Ai\AiProvider>
 */
function build_providers(array $env, HttpClient $http): array
{
    $str = static fn (string $k, string $default = ''): string => is_string($env[$k] ?? null) ? $env[$k] : $default;
    $providers = [];
    foreach (array_map('trim', explode(',', $str('AI_PROVIDERS', 'gemini,groq'))) as $name) {
        if ($name === 'gemini') {
            $providers[] = new GeminiProvider($http, $str('GEMINI_API_KEY'), $str('GEMINI_MODEL', 'gemini-3.5-flash-lite'), $str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'));
        } elseif ($name === 'groq') {
            $providers[] = new GroqProvider($http, $str('GROQ_API_KEY'), $str('GROQ_MODEL', 'openai/gpt-oss-20b'), $str('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'));
        }
    }
    return $providers;
}

/**
 * Saúde de cada provedor, ISOLADAMENTE (o failover esconderia a Groq enquanto o Gemini responde).
 *
 * @param array<string, mixed> $env
 * @return list<array{provider: string, ok: bool, seconds: float, detail: string}>
 */
function check_providers(array $env, HttpClient $http): array
{
    $results = [];
    foreach (build_providers($env, $http) as $provider) {
        $t0 = microtime(true);
        try {
            $answer = $provider->complete('Responda só com a palavra: ok', 'Teste de saúde do gateway.', 200);
            $results[] = ['provider' => $provider->name(), 'ok' => true, 'seconds' => microtime(true) - $t0, 'detail' => mb_substr($answer, 0, 40)];
        } catch (Spike\Ai\AiUnavailable $e) {
            $results[] = ['provider' => $provider->name(), 'ok' => false, 'seconds' => microtime(true) - $t0, 'detail' => $e->getMessage()];
        }
    }
    return $results;
}

/** @param array<string, mixed> $env */
function build_gateway(array $env, ?HttpClient $http = null): ChatGateway
{
    $http ??= new CurlHttpClient();
    $str = static fn (string $k, string $default = ''): string => is_string($env[$k] ?? null) ? $env[$k] : $default;
    $int = static fn (string $k, int $default): int => is_int($env[$k] ?? null) ? $env[$k] : $default;
    $providers = build_providers($env, $http);

    $limiter = new RateLimiter(
        new FileRateLimitStore($str('AI_RATE_LIMIT_FILE', sys_get_temp_dir() . '/spike-ai-rate-limit.json')),
        $int('AI_LIMIT_PER_MINUTE', 5),
        $int('AI_LIMIT_PER_DAY', 30),
        $int('AI_LIMIT_GLOBAL_PER_DAY', 200),
        $str('AI_RATE_LIMIT_SALT', 'spike'),
    );

    return new ChatGateway(personas(), $limiter, new FailoverProvider($providers), $int('AI_MAX_TOKENS', 600), static function (string $m): void {
        error_log('[ai_chat] ' . $m);
    });
}

/**
 * IP do visitante. Atrás do Cloudflare, REMOTE_ADDR é o IP do Cloudflare: o IP real vem em CF-Connecting-IP.
 * Esse cabeçalho pode ser forjado por quem acessar o servidor sem passar pelo Cloudflare; por isso existe o
 * teto global diário, que protege a cota mesmo com IPs falsos.
 */
function client_ip(array $server): string
{
    $cf = $server['HTTP_CF_CONNECTING_IP'] ?? '';
    return is_string($cf) && filter_var($cf, FILTER_VALIDATE_IP) ? $cf : (string) ($server['REMOTE_ADDR'] ?? '0.0.0.0');
}
