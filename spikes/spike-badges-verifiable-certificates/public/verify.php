<?php
declare(strict_types=1);

// GET ?code=… ➔ a página pública de verificação do certificado (decisão do Pablo, 2026-11-11, LGPD): o nome de exibição,
// o curso, a instituição, a data de conclusão e o código. Nunca o e-mail, as notas nem os atributos. Fora dos buscadores
// (noindex). A mesma página imprime em PDF pelo navegador.

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Spike\Badges\CertificateCode;
use Spike\Badges\CertificateStore;

$e = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Robots-Tag: noindex');
header('X-Content-Type-Options: nosniff');
try {
    $code = CertificateCode::normalize($_GET['code'] ?? null);
    $cert = $code === null ? null : (new CertificateStore(badges_pdo()))->byCode($code);
} catch (Throwable $ex) {
    error_log('[spike-badges] ' . get_class($ex) . ': ' . $ex->getMessage());
    http_response_code(500);
    $cert = null;
    $code = null;
}
if ($cert === null && http_response_code() !== 500) {
    http_response_code(404);
}
$date = $cert === null ? '' : DateTimeImmutable::createFromFormat('Y-m-d', (string) $cert['completed_on'])->format('d/m/Y');
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title><?= $cert === null ? 'Certificado não encontrado' : 'Certificado verificado' ?> · PMLife Labs</title>
  <style>
    body { margin: 0; font: 16px/1.5 Georgia, 'Times New Roman', serif; background: #f4f1ea; color: #1b1c1f; }
    main { max-width: 720px; margin: 32px auto; padding: 40px 32px; background: #fff; border: 6px double #b08d57; text-align: center; }
    h1 { font-size: 1.1rem; letter-spacing: .12em; text-transform: uppercase; color: #6b5532; margin: 0 0 24px; }
    .name { font-size: 2rem; margin: 8px 0; } .course { font-size: 1.3rem; margin: 8px 0 24px; }
    .meta { color: #5d6068; font: .9rem/1.6 system-ui, sans-serif; } .ok { color: #2b8a3e; font: 600 .95rem system-ui, sans-serif; }
    .code { font-family: ui-monospace, monospace; letter-spacing: .08em; }
    @media print { body { background: #fff; } main { margin: 0 auto; } .noprint { display: none; } }
  </style>
</head>
<body>
<main>
<?php if ($cert === null): ?>
  <h1>Certificado não encontrado</h1>
  <p class="meta">Confira o código. Ele tem 20 letras e números, em grupos de 5.</p>
<?php else: ?>
  <h1>Certificado de conclusão</h1>
  <p class="ok">✓ Certificado verificado</p>
  <p class="meta">Certificamos que</p>
  <p class="name"><?= $e((string) $cert['student_name']) ?></p>
  <p class="meta">concluiu o curso</p>
  <p class="course"><?= $e((string) $cert['course_title']) ?></p>
  <p class="meta">oferecido por <strong><?= $e((string) $cert['institution_name']) ?></strong>, em <?= $e($date) ?>.</p>
  <p class="meta">Código de verificação: <span class="code"><?= $e(CertificateCode::pretty((string) $cert['code'])) ?></span></p>
  <p class="meta noprint"><a href="ob.php?type=assertion&amp;code=<?= $e((string) $cert['code']) ?>">Este certificado no padrão Open Badges 2.0 (JSON)</a> · <a href="#" onclick="window.print();return false;">Imprimir ou salvar em PDF</a></p>
<?php endif; ?>
</main>
</body>
</html>
