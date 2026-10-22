<?php
declare(strict_types=1);

// Monta a API a partir de um PDO e de uma sessão. O sal do hash do limite de tentativas vem do env (nunca do código
// no produto); aqui, o valor padrão só serve aos testes.

require_once __DIR__ . '/bootstrap.php';

use Spike\Auth\Auth\AuthApi;
use Spike\Auth\Auth\AuthService;
use Spike\Auth\Auth\Csrf;
use Spike\Auth\Auth\LoginThrottle;
use Spike\Auth\Auth\PasswordPolicy;
use Spike\Auth\Auth\PdoAccountRepository;
use Spike\Auth\Auth\PdoThrottleStore;
use Spike\Auth\Auth\SessionStore;

function build_auth_api(PDO $pdo, SessionStore $session, string $salt = 'spike-salt', ?PasswordPolicy $passwords = null): AuthApi
{
    $csrf = new Csrf($session);
    $service = new AuthService(
        new PdoAccountRepository($pdo),
        $passwords ?? PasswordPolicy::default(),
        new LoginThrottle(new PdoThrottleStore($pdo), $salt),
        $session,
        $csrf,
    );
    return new AuthApi($service, $csrf, $pdo);
}
