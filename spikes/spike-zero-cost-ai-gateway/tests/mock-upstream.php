<?php
// Falsos Gemini e Groq para o teste ponta a ponta. O prefixo do caminho escolhe o comportamento:
//   /gemini-down/...  responde 429 (cota esgotada)     /groq-ok/...  responde como a Groq
// Cada requisição recebida é gravada em MOCK_LOG, para o teste conferir o que o gateway enviou.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$body = file_get_contents('php://input');
file_put_contents(getenv('MOCK_LOG'), json_encode(['path' => $path, 'headers' => getallheaders(), 'body' => json_decode($body, true)]) . "\n", FILE_APPEND);
header('Content-Type: application/json');
if (strpos($path, '/gemini-down/') === 0) {
    http_response_code(429);
    echo '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}';
} elseif (strpos($path, '/groq-ok/') === 0) {
    echo json_encode(['choices' => [['message' => ['role' => 'assistant', 'content' => 'Resposta da Groq falsa.']]]]);
} else {
    http_response_code(404);
}
