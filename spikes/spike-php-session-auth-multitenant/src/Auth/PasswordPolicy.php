<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

/**
 * Senha: Argon2id quando o PHP tem suporte (com bcrypt como alternativa), regras do OWASP ASVS nível 1 e rehash
 * transparente quando o algoritmo ou o custo mudam.
 *
 * - ASVS 2.1.1/2.1.2: de 12 a 128 caracteres; espaços e qualquer caractere Unicode valem (nada de "1 maiúscula").
 * - ASVS 2.1.7: recusa senhas comuns. Aqui, uma lista curta embutida; em produção, a API de faixa do Have I Been Pwned
 *   (k-anonimato: só os 5 primeiros caracteres do SHA-1 saem do servidor; gratuita e sem chave) ou uma lista maior.
 * - Argon2id com 19 MiB e 2 iterações (mínimo recomendado pelo OWASP): cabe numa hospedagem compartilhada.
 */
final class PasswordPolicy
{
    public const MIN_LENGTH = 12;
    public const MAX_LENGTH = 128;

    private const COMMON = [
        '123456789012', 'qwertyuiopas', 'senhasenha12', 'password1234', 'passwordpassword', 'aaaaaaaaaaaa',
        '000000000000', '111111111111', 'abcdefghijkl', 'iloveyou1234', 'minhasenha123', 'admin1234567',
    ];

    private ?string $dummyHash = null;

    public function __construct(
        private readonly string|int|null $algo = null,
        private readonly array $options = [],
    ) {
    }

    public static function default(): self
    {
        return defined('PASSWORD_ARGON2ID')
            ? new self(PASSWORD_ARGON2ID, ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1])
            : new self(PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /** Motivo da recusa (código de erro) ou null se a senha é aceita. */
    public function problem(string $password, string $email): ?string
    {
        $length = mb_strlen($password);
        if ($length < self::MIN_LENGTH) {
            return 'PASSWORD_TOO_SHORT';
        }
        if ($length > self::MAX_LENGTH) {
            return 'PASSWORD_TOO_LONG';
        }
        $normalized = mb_strtolower($password);
        if (in_array($normalized, self::COMMON, true) || $normalized === mb_strtolower($email)) {
            return 'PASSWORD_TOO_COMMON';
        }
        return null;
    }

    public function hash(string $password): string
    {
        return password_hash($password, $this->algo ?? PASSWORD_DEFAULT, $this->options);
    }

    public function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, $this->algo ?? PASSWORD_DEFAULT, $this->options);
    }

    /**
     * Gasta o mesmo tempo de uma verificação real quando o e-mail não existe: sem isso, a resposta mais rápida
     * revelaria quais e-mails têm conta (ASVS 2.2/3.x, enumeração por tempo).
     */
    public function burnTime(string $password): void
    {
        $this->dummyHash ??= $this->hash(bin2hex(random_bytes(16)));
        password_verify($password, $this->dummyHash);
    }
}
