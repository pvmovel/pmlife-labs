<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

use DateTimeImmutable;
use PDO;
use Spike\Auth\Tenant\ProgressRepository;

/**
 * As rotas da API, sem depender do servidor HTTP (os testes chamam handle() direto; os endpoints de http/api/ só
 * repassam o pedido). Respostas no envelope do contrato do PMLife: {status: "success", data} ou
 * {status: "error", error: {code}}.
 *
 *   GET  me        visitante ou conectado (+ csrfToken para os POSTs)
 *   POST register  {inviteCode, email, password, displayName, acceptTerms}
 *   POST login     {email, password, tenant?}
 *   POST logout
 *   GET  progress  progresso do aluno conectado (só o tenant e o aluno da sessão)
 *   POST progress  {questId, xp}
 *
 * Todo POST exige Content-Type application/json e o cabeçalho X-CSRF-Token.
 */
final class AuthApi
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly Csrf $csrf,
        private readonly PDO $pdo,
    ) {
    }

    /**
     * @param array<string, string> $headers cabeçalhos do pedido (qualquer caixa)
     * @return array{0: int, 1: array<string, mixed>, 2?: array<string, string>} status, corpo e cabeçalhos extras
     */
    public function handle(string $method, string $route, array $headers, string $body, string $ip, DateTimeImmutable $now): array
    {
        $headers = array_change_key_case($headers, CASE_LOWER);
        $routes = ['me' => 'GET', 'register' => 'POST', 'login' => 'POST', 'logout' => 'POST', 'progress' => ['GET', 'POST']];
        if (!isset($routes[$route])) {
            return self::error(404, 'NOT_FOUND');
        }
        if (!in_array($method, (array) $routes[$route], true)) {
            return self::error(405, 'METHOD_NOT_ALLOWED');
        }

        $input = [];
        if ($method === 'POST') {
            if (!str_starts_with(strtolower($headers['content-type'] ?? ''), 'application/json')) {
                return self::error(415, 'UNSUPPORTED_MEDIA_TYPE');
            }
            if (!$this->csrf->valid($headers['x-csrf-token'] ?? null)) {
                return self::error(403, 'CSRF_INVALID');
            }
            $input = json_decode($body, true);
            if (!is_array($input)) {
                return self::error(400, 'INVALID_REQUEST');
            }
        }

        return match ($route) {
            'me' => $this->me($now),
            'register' => $this->register($input, $ip, $now),
            'login' => $this->login($input, $ip, $now),
            'logout' => $this->logout(),
            'progress' => $method === 'GET' ? $this->listProgress($now) : $this->addProgress($input, $now),
        };
    }

    private function me(DateTimeImmutable $now): array
    {
        $ctx = $this->auth->current($now);
        $who = $ctx ? $this->auth->describe($ctx) : null;
        return self::ok(200, ['authenticated' => $who !== null, 'csrfToken' => $this->csrf->token()] + ($who ?? []));
    }

    private function register(array $in, string $ip, DateTimeImmutable $now): array
    {
        $email = self::email($in['email'] ?? null);
        $name = self::displayName($in['displayName'] ?? null);
        $invite = is_string($in['inviteCode'] ?? null) ? strtoupper(trim($in['inviteCode'])) : '';
        $password = $in['password'] ?? null;
        if ($email === null || $name === null || !preg_match('/^[A-Z0-9-]{4,32}$/', $invite) || !is_string($password)) {
            return self::error(400, 'INVALID_REQUEST');
        }
        // LGPD: sem aceite dos termos (versão registrada), não há conta.
        if (($in['acceptTerms'] ?? null) !== true) {
            return self::error(400, 'TERMS_REQUIRED');
        }
        $r = $this->auth->register($invite, $email, $password, $name, $ip, $now);
        if (!$r['ok']) {
            $status = ['RATE_LIMITED' => 429, 'EMAIL_IN_USE' => 409][$r['code']] ?? 400;
            return self::error($status, $r['code']);
        }
        return self::ok(201, ['user' => $r['user'], 'tenant' => $r['tenant'], 'role' => 'student', 'csrfToken' => $this->csrf->token()]);
    }

    private function login(array $in, string $ip, DateTimeImmutable $now): array
    {
        $email = self::email($in['email'] ?? null);
        $password = $in['password'] ?? null;
        $tenant = $in['tenant'] ?? null;
        if ($email === null || !is_string($password) || $password === '' || mb_strlen($password) > PasswordPolicy::MAX_LENGTH || ($tenant !== null && !is_string($tenant))) {
            return self::error(400, 'INVALID_REQUEST');
        }
        $r = $this->auth->login($email, $password, $tenant, $ip, $now);
        if ($r['ok']) {
            return self::ok(200, ['user' => $r['user'], 'tenant' => $r['tenant'], 'role' => $r['role'], 'csrfToken' => $this->csrf->token()]);
        }
        return match ($r['code']) {
            'LOGIN_LOCKED' => self::error(429, 'LOGIN_LOCKED', [], ['Retry-After' => (string) $r['retryAfter']]),
            'TENANT_REQUIRED' => self::error(409, 'TENANT_REQUIRED', ['tenants' => $r['tenants']]),
            'NOT_A_MEMBER' => self::error(403, 'NOT_A_MEMBER'),
            default => self::error(401, 'INVALID_CREDENTIALS'),
        };
    }

    private function logout(): array
    {
        $this->auth->logout();
        return self::ok(200, ['authenticated' => false]);
    }

    private function listProgress(DateTimeImmutable $now): array
    {
        $ctx = $this->auth->current($now);
        if ($ctx === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        return self::ok(200, ['events' => (new ProgressRepository($this->pdo, $ctx))->mine()]);
    }

    private function addProgress(array $in, DateTimeImmutable $now): array
    {
        $ctx = $this->auth->current($now);
        if ($ctx === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        $quest = $in['questId'] ?? null;
        $xp = $in['xp'] ?? null;
        // Um "tenantId" no corpo é ignorado: o tenant vem só da sessão.
        if (!is_string($quest) || !preg_match('/^[a-z0-9-]{1,40}$/', $quest) || !is_int($xp) || $xp < 0 || $xp > 10000) {
            return self::error(400, 'INVALID_REQUEST');
        }
        $id = (new ProgressRepository($this->pdo, $ctx))->add($quest, $xp, $now);
        return self::ok(201, ['id' => $id]);
    }

    private static function email(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $e = mb_strtolower(trim($v));
        return strlen($e) <= 254 && filter_var($e, FILTER_VALIDATE_EMAIL) !== false ? $e : null;
    }

    private static function displayName(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $n = trim((string) preg_replace('/[\p{C}]+/u', '', $v)); // sem caracteres de controle
        return $n !== '' && mb_strlen($n) <= 40 ? $n : null;
    }

    private static function ok(int $status, array $data): array
    {
        return [$status, ['status' => 'success', 'data' => $data]];
    }

    private static function error(int $status, string $code, array $extra = [], array $headers = []): array
    {
        return [$status, ['status' => 'error', 'error' => ['code' => $code] + $extra], $headers];
    }
}
