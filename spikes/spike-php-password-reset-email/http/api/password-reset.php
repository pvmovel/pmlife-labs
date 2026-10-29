<?php
declare(strict_types=1);

// Controller fino do spike (no labs responde 403: a pasta http/ não é webroot). Na Etapa 2 vira
// public/api/auth/password-reset/{request,confirm}.php, com o env, o CSRF e o IP do Cloudflare da US30.
require_once dirname(__DIR__, 2) . '/src/factory.php';

use Spike\Reset\Http\Responder;

$route = (string) ($_GET['route'] ?? '');
$input = json_decode((string) file_get_contents('php://input'), true);
$api = spike_reset_api(spike_reset_config_from_env());
Responder::send($api->handle($route, is_array($input) ? $input : [], (string) ($_SERVER['REMOTE_ADDR'] ?? ''), new DateTimeImmutable()));
