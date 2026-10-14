<?php
declare(strict_types=1);

// Demo ao vivo, SÓ LEITURA: mostra o que o Migrator aplicou no banco real do labs
// (o Cron do cPanel roda `migrate.php up` com o usuário admin; esta página usa o usuário app, sem DDL).

require_once dirname(__DIR__) . '/src/LabsConfig.php';
require_once dirname(__DIR__) . '/src/ConnectionFactory.php';
require_once dirname(__DIR__) . '/src/PdoNoteRepository.php';

$h = static function (string $v): string { return htmlspecialchars($v, ENT_QUOTES, 'UTF-8'); };

$error = null;
$server = '';
$versions = [];
$notes = [];
try {
    $pdo = ConnectionFactory::create(LabsConfig::load());
    $server = (string) $pdo->query('SELECT VERSION() AS v')->fetch()['v'];
    $versions = $pdo->query('SELECT version, applied_at FROM schema_migrations ORDER BY version')->fetchAll();
    $notes = (new PdoNoteRepository($pdo))->findAll();
} catch (Throwable $e) {
    error_log('[spike-migrations] ' . get_class($e) . ': ' . $e->getMessage());
    http_response_code(500);
    $error = 'Banco indisponível ou migrations ainda não aplicadas. O detalhe foi registrado no log do servidor.';
}

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Migrations ao vivo · PMLife Labs</title>
  <style>
    :root { --bg:#f7f7f5; --card:#fff; --text:#1b1c1f; --muted:#5d6068; --line:#e3e3de; --ok:#2b8a3e; --err:#c92a2a; }
    @media (prefers-color-scheme: dark) { :root { --bg:#0f1014; --card:#17191e; --text:#ecedf0; --muted:#9da1ab; --line:#2a2d35; --ok:#69db7c; --err:#ff8787; } }
    body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui, sans-serif; }
    main { max-width:760px; margin:0 auto; padding:32px 16px; }
    h1 { margin:0 0 6px; font-size:1.6rem; } p { color:var(--muted); margin:0 0 20px; }
    section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:16px; }
    h2 { margin:0 0 10px; font-size:1rem; } table { width:100%; border-collapse:collapse; font-size:.95rem; }
    th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); } th { color:var(--muted); font-weight:600; }
    code { font-family:ui-monospace, Menlo, monospace; font-size:.9em; } .ok { color:var(--ok); } .err { color:var(--err); }
    a { color:inherit; }
  </style>
</head>
<body>
<main>
  <h1>Migrations versionadas: banco real</h1>
  <p>Leitura ao vivo do MySQL do labs. As migrations foram aplicadas pelo <code>Migrator</code> (via Cron, usuário admin); esta página conecta com um usuário <strong>só de leitura e escrita de dados</strong>, sem privilégio de DDL.</p>
<?php if ($error !== null): ?>
  <section><h2 class="err">Indisponível</h2><p><?= $h($error) ?></p></section>
<?php else: ?>
  <section>
    <h2 class="ok">Conectado · MySQL <?= $h($server) ?></h2>
    <table>
      <thead><tr><th>Versão</th><th>Aplicada em</th></tr></thead>
      <tbody>
<?php foreach ($versions as $v): ?>
        <tr><td><code><?= $h((string) $v['version']) ?></code></td><td><?= $h((string) $v['applied_at']) ?></td></tr>
<?php endforeach; ?>
      </tbody>
    </table>
  </section>
  <section>
    <h2>Notas lidas pelo <code>PdoNoteRepository</code></h2>
    <table>
      <thead><tr><th>#</th><th>Título</th></tr></thead>
      <tbody>
<?php foreach ($notes as $n): ?>
        <tr><td><?= (int) $n['id'] ?></td><td><?= $h($n['title']) ?></td></tr>
<?php endforeach; ?>
      </tbody>
    </table>
  </section>
<?php endif; ?>
  <p><a href="../../../catalogo/spike-sql-versioned-migrations/">← Documentação do spike</a></p>
</main>
</body>
</html>
