<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

use DateTimeImmutable;
use PDOException;
use Spike\Auth\Tenant\TenantContext;

/**
 * Cadastro por código de convite, login por e-mail e senha, sessão com expiração e logout.
 *
 * Política de sessão (ASVS 3.3): expira após 2 h sem uso e, de qualquer jeito, 12 h depois do login. Sessões PHP em
 * arquivo numa hospedagem compartilhada não são feitas para durar semanas; entrar de novo é barato, e o progresso do
 * visitante continua no navegador.
 */
final class AuthService
{
    public const IDLE_SECONDS = 7200;
    public const ABSOLUTE_SECONDS = 43200;
    public const TERMS_VERSION = '2026-10';

    public function __construct(
        private readonly PdoAccountRepository $accounts,
        private readonly PasswordPolicy $passwords,
        private readonly LoginThrottle $throttle,
        private readonly SessionStore $session,
        private readonly Csrf $csrf,
    ) {
    }

    /**
     * @return array{ok: true, user: array, tenant: array}|array{ok: false, code: string}
     */
    public function register(string $invite, string $email, string $password, string $displayName, string $ip, DateTimeImmutable $now): array
    {
        if (!$this->throttle->allowSignup($ip, $now)) {
            return ['ok' => false, 'code' => 'RATE_LIMITED'];
        }
        $tenant = $this->accounts->tenantByInvite($invite);
        if ($tenant === null) {
            return ['ok' => false, 'code' => 'INVALID_INVITE'];
        }
        if (($problem = $this->passwords->problem($password, $email)) !== null) {
            return ['ok' => false, 'code' => $problem];
        }
        // Responder "e-mail já cadastrado" revela que a conta existe; o limite de cadastros por IP reduz o uso
        // disso para descobrir contas em massa (trade-off registrado no README).
        if ($this->accounts->userByEmail($email) !== null) {
            return ['ok' => false, 'code' => 'EMAIL_IN_USE'];
        }
        try {
            $userId = $this->accounts->createStudent($tenant['id'], $email, $displayName, $this->passwords->hash($password), self::TERMS_VERSION, $now);
        } catch (PDOException $e) {
            // Dois cadastros simultâneos com o mesmo e-mail: o índice único decide, sem conta duplicada.
            if ($this->accounts->userByEmail($email) !== null) {
                return ['ok' => false, 'code' => 'EMAIL_IN_USE'];
            }
            throw $e;
        }
        $this->startSession($userId, $tenant['id'], 'student', $now);
        return ['ok' => true, 'user' => ['displayName' => $displayName, 'email' => $email], 'tenant' => ['slug' => $tenant['slug'], 'name' => $tenant['name']]];
    }

    /**
     * @return array{ok: true, user: array, tenant: array, role: string}|array{ok: false, code: string, tenants?: list<array>, retryAfter?: int}
     */
    public function login(string $email, string $password, ?string $tenantSlug, string $ip, DateTimeImmutable $now): array
    {
        if ($this->throttle->loginLocked($email, $ip, $now)) {
            return ['ok' => false, 'code' => 'LOGIN_LOCKED', 'retryAfter' => $this->throttle->retryAfter($now)];
        }
        $user = $this->accounts->userByEmail($email);
        if ($user === null) {
            $this->passwords->burnTime($password);
        }
        if ($user === null || !$this->passwords->verify($password, $user['passwordHash'])) {
            $this->throttle->loginFailed($email, $ip, $now);
            // A mesma resposta para "e-mail não existe" e "senha errada" (ASVS 2.2/3.x).
            return ['ok' => false, 'code' => 'INVALID_CREDENTIALS'];
        }
        $this->throttle->loginSucceeded($email, $ip);
        if ($this->passwords->needsRehash($user['passwordHash'])) {
            $this->accounts->updateHash($user['id'], $this->passwords->hash($password));
        }

        $memberships = $this->accounts->memberships($user['id']);
        if ($tenantSlug !== null) {
            $memberships = array_values(array_filter($memberships, static fn (array $m): bool => $m['slug'] === $tenantSlug));
        }
        if ($memberships === []) {
            return ['ok' => false, 'code' => 'NOT_A_MEMBER'];
        }
        if (count($memberships) > 1) {
            // A conta é de mais de um cliente: o front pergunta qual e repete o login com "tenant".
            return ['ok' => false, 'code' => 'TENANT_REQUIRED', 'tenants' => array_map(static fn (array $m): array => ['slug' => $m['slug'], 'name' => $m['name']], $memberships)];
        }
        $m = $memberships[0];
        $this->startSession($user['id'], $m['tenantId'], $m['role'], $now);
        return ['ok' => true, 'user' => ['displayName' => $user['displayName'], 'email' => $email], 'tenant' => ['slug' => $m['slug'], 'name' => $m['name']], 'role' => $m['role']];
    }

    public function logout(): void
    {
        $this->session->destroy();
    }

    /** Quem está conectado, ou null (visitante, sessão expirada ou encerrada). Renova o tempo sem uso. */
    public function current(DateTimeImmutable $now): ?TenantContext
    {
        $userId = $this->session->get('uid');
        if (!is_int($userId)) {
            return null;
        }
        $t = $now->getTimestamp();
        if ($t - (int) $this->session->get('seen_at') > self::IDLE_SECONDS || $t - (int) $this->session->get('auth_at') > self::ABSOLUTE_SECONDS) {
            $this->session->destroy();
            return null;
        }
        $this->session->set('seen_at', $t);
        return new TenantContext((int) $this->session->get('tid'), $userId, (string) $this->session->get('role'));
    }

    /** @return array{user: array, tenant: array, role: string}|null */
    public function describe(TenantContext $ctx): ?array
    {
        $user = $this->accounts->userById($ctx->userId);
        $tenant = array_values(array_filter($this->accounts->memberships($ctx->userId), static fn (array $m): bool => $m['tenantId'] === $ctx->tenantId))[0] ?? null;
        if ($user === null || $tenant === null) {
            return null;
        }
        return ['user' => ['displayName' => $user['displayName'], 'email' => $user['email']], 'tenant' => ['slug' => $tenant['slug'], 'name' => $tenant['name']], 'role' => $ctx->role];
    }

    /** Login e cadastro trocam o ID da sessão e o token CSRF (contra fixação de sessão, ASVS 3.2.1). */
    private function startSession(int $userId, int $tenantId, string $role, DateTimeImmutable $now): void
    {
        $this->session->regenerate();
        $this->session->set('uid', $userId);
        $this->session->set('tid', $tenantId);
        $this->session->set('role', $role);
        $this->session->set('auth_at', $now->getTimestamp());
        $this->session->set('seen_at', $now->getTimestamp());
        $this->csrf->rotate();
    }
}
