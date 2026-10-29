<?php
declare(strict_types=1);

// Monta o serviço a partir de uma configuração (no PMLife, o env do ambiente, fora do webroot).
require_once __DIR__ . '/bootstrap.php';

use Spike\Reset\Auth\PasswordPolicy;
use Spike\Reset\Auth\PdoThrottleStore;
use Spike\Reset\Db\ConnectionFactory;
use Spike\Reset\Http\ResetApi;
use Spike\Reset\Mail\Mailer;
use Spike\Reset\Mail\SmtpMailer;
use Spike\Reset\Reset\PasswordResetService;
use Spike\Reset\Reset\PdoResetStore;
use Spike\Reset\Reset\ResetThrottle;

/** @param array<string, mixed> $config */
function spike_reset_service(PDO $pdo, Mailer $mailer, array $config): PasswordResetService
{
    return new PasswordResetService(
        new PdoResetStore($pdo),
        new ResetThrottle(new PdoThrottleStore($pdo), (string) $config['RATE_SALT']),
        PasswordPolicy::default(),
        $mailer,
        (string) $config['RESET_SECRET'],
    );
}

/** @param array<string, mixed> $config */
function spike_smtp_mailer(array $config): SmtpMailer
{
    return new SmtpMailer(
        (string) $config['SMTP_HOST'],
        (int) $config['SMTP_PORT'],
        (bool) ($config['SMTP_TLS'] ?? true),
        (string) $config['SMTP_USER'],
        (string) $config['SMTP_PASS'],
        (string) $config['MAIL_FROM'],
        (string) ($config['MAIL_FROM_NAME'] ?? 'PMLife'),
        isset($config['SMTP_CAFILE']) ? (string) $config['SMTP_CAFILE'] : null,
    );
}

/** @param array<string, mixed> $config */
function spike_reset_api(array $config): ResetApi
{
    return new ResetApi(spike_reset_service(ConnectionFactory::create($config), spike_smtp_mailer($config), $config));
}

/** @return array<string, mixed> */
function spike_reset_config_from_env(): array
{
    $keys = ['DB_DRIVER', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'RATE_SALT', 'RESET_SECRET',
        'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_CAFILE', 'MAIL_FROM', 'MAIL_FROM_NAME'];
    $config = [];
    foreach ($keys as $k) {
        $v = getenv('SPIKE_' . $k);
        if ($v !== false) {
            $config[$k] = $v;
        }
    }
    return $config;
}
