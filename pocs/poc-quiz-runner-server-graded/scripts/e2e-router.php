<?php
declare(strict_types=1);

// Roteador do `php -S` só do e2e: serve public/ como o Apache e, com QUIZ_E2E=1, responde /__e2e/answers?ids=1,2 com
// o gabarito (para o teste saber o que marcar). Fica fora de public/ (403 no ar) e a variável nunca existe na
// hospedagem: o gabarito continua sem nenhuma rota pública.

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
if ($path === '/__e2e/answers' && getenv('QUIZ_E2E') === '1') {
    require_once dirname(__DIR__) . '/php/bootstrap.php';
    $ids = array_values(array_filter(array_map('intval', explode(',', (string) ($_GET['ids'] ?? '')))));
    $bank = (new Poc\Quiz\QuizStore(quiz_pdo()))->questions('astronomia', $ids);
    header('Content-Type: application/json');
    echo json_encode(array_map(static fn (array $q): array => $q['answer'], $bank));
    return true;
}
return false;
