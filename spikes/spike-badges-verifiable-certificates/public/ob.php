<?php
declare(strict_types=1);

// GET ?type=assertion&code=… · ?type=badge&tenant=&course= · ?type=issuer&tenant=
// O certificado no padrão Open Badges 2.0 (verificação "hosted"): público, sem sessão. O e-mail de quem recebeu só vai
// como hash com sal.

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Spike\Badges\CertificateCode;
use Spike\Badges\CertificateStore;
use Spike\Badges\DemoCourse;
use Spike\Badges\OpenBadges;

header('X-Robots-Tag: noindex');
try {
    $base = badges_base();
    $type = $_GET['type'] ?? '';
    $tenant = filter_var($_GET['tenant'] ?? null, FILTER_VALIDATE_INT);
    if ($type === 'assertion') {
        $code = CertificateCode::normalize($_GET['code'] ?? null);
        $cert = $code === null ? null : (new CertificateStore(badges_pdo()))->byCode($code);
        $cert === null ? badges_json(404, ['status' => 'error', 'error' => ['code' => 'CERTIFICATE_NOT_FOUND']]) : badges_json(200, OpenBadges::assertion($cert, $base), 'application/ld+json');
    } elseif ($type === 'badge' && isset(DemoCourse::TENANTS[$tenant]) && ($_GET['course'] ?? '') === DemoCourse::ID) {
        badges_json(200, OpenBadges::badgeClass($tenant, DemoCourse::ID, DemoCourse::TITLE, $base), 'application/ld+json');
    } elseif ($type === 'issuer' && isset(DemoCourse::TENANTS[$tenant])) {
        badges_json(200, OpenBadges::issuer($tenant, DemoCourse::TENANTS[$tenant], $base), 'application/ld+json');
    } else {
        badges_json(404, ['status' => 'error', 'error' => ['code' => 'NOT_FOUND']]);
    }
} catch (Throwable $e) {
    error_log('[spike-badges] ' . get_class($e) . ': ' . $e->getMessage());
    badges_json(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
