<?php
declare(strict_types=1);

/**
 * Localiza e carrega o arquivo de ambiente que fica FORA do webroot.
 *
 * Na hospedagem compartilhada (cPanel) o home costuma ser `/home<N>/<conta>/`,
 * por isso nenhum caminho absoluto é fixado: o loader procura em
 *   1. getenv('HOME');
 *   2. os diretórios acima do DOCUMENT_ROOT (até MAX_LEVELS níveis).
 */

const ENV_ALLOWED = ['development', 'homolog', 'production'];
const ENV_MAX_LEVELS = 4;
// Prefixo do arquivo: separa os envs desta aplicação dos de outras que dividem o mesmo HOME
// (na hospedagem compartilhada, várias apps da conta ficam no mesmo /home<N>/<conta>/).
const ENV_FILE_PREFIX = 'labs';

/**
 * Deduz o ambiente pelo host. APP_ENV (variável de ambiente do processo) tem prioridade.
 */
function detect_env(string $host): string
{
    $forced = getenv('APP_ENV');
    if (is_string($forced) && in_array($forced, ENV_ALLOWED, true)) {
        return $forced;
    }

    $host = strtolower(preg_replace('/:\d+$/', '', $host) ?? '');
    if ($host === 'localhost' || $host === '127.0.0.1' || $host === '') {
        return 'development';
    }
    if (strpos($host, 'homolog.') === 0) {
        return 'homolog';
    }
    return 'production';
}

/**
 * Retorna os diretórios candidatos, em ordem de prioridade e sem repetição.
 *
 * @return string[]
 */
function env_candidate_dirs(): array
{
    $dirs = [];

    $home = getenv('HOME');
    if (is_string($home) && $home !== '') {
        $dirs[] = $home;
    }

    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
    if ($docRoot !== '') {
        $dir = dirname($docRoot);
        for ($i = 0; $i < ENV_MAX_LEVELS; $i++) {
            $dirs[] = $dir;
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        }
    }

    return array_values(array_unique(array_map(
        static function (string $d): string { return rtrim($d, '/'); },
        $dirs
    )));
}

/**
 * Carrega `labs.<env>.env.php` (que deve retornar um array) do primeiro diretório candidato que o contém.
 *
 * @return array<string, mixed>
 * @throws RuntimeException quando o arquivo não existe ou é inválido (a mensagem não contém caminhos).
 */
function load_env(string $env): array
{
    if (!in_array($env, ENV_ALLOWED, true)) {
        throw new RuntimeException('ENV_INVALID');
    }

    $file = ENV_FILE_PREFIX . ".{$env}.env.php";
    foreach (env_candidate_dirs() as $dir) {
        $path = $dir . '/' . $file;
        if (is_file($path) && is_readable($path)) {
            $config = require $path;
            if (!is_array($config)) {
                throw new RuntimeException('ENV_MALFORMED');
            }
            return $config;
        }
    }

    throw new RuntimeException('ENV_NOT_FOUND');
}
